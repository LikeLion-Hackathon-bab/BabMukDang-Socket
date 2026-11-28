import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService } from '../services/room.service';
import { Server } from 'socket.io';
import {
  AnnouncementStage,
  AnnouncementStageMap,
  InvitationStage,
  InvitationStageMap,
} from 'src/domain/common/types/stage';
import { ReadyStateDto } from '../dto/request.dto';
import { FinalState } from '../types/room.type';
import { ServerService } from '../services/server.service';
import {
  fromOffsetDateTime,
  toKstOffsetDateTime,
} from '../services/meeting-time';
import type { Restaurant } from 'src/domain/restaurant/types/restaurant.type';

@Injectable()
export class RoomHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly roomService: RoomStoreService,
    private readonly serverService: ServerService,
  ) {}

  handleFinalStateResponse(server: Server) {
    const emitter = this.roomService.getEventEmitter();
    emitter.on(
      'final-state-response',
      ({ roomId, finalState }: { roomId: string; finalState: FinalState }) => {
        void this.roomService.getStage(roomId);
        server.to(roomId).emit('final-state-response', {
          roomId,
          finalState,
        });
      },
    );
  }

  handleReadyState(
    client: Socket,
    payload: ReadyStateDto,
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { isReady } = payload;

    this.roomService.updateParticipantReadyState(
      roomId,
      userInfo.userId,
      isReady,
    );
    this.logger.log(
      `User ${userInfo.userId} ready state changed to ${isReady} in room ${roomId}`,
    );

    // 다른 참여자들에게 준비 상태 변경 알림 (정확한 네임스페이스로 전송)
    client.nsp.to(roomId).emit('ready-state-changed', {
      readyCount: this.roomService.getParticipantReadyCount(roomId),
      participantCount: this.roomService.getParticipantCount(roomId),
    });

    // 성공 응답
    // client.emit('ready-state-success', {
    //   roomId,
    //   userId: userInfo.userId,
    //   isReady,
    //   timestamp: Date.now(),
    // });
  }
  handleInitialStateResponse(server: Server) {
    const emitter = this.roomService.getEventEmitter();
    emitter.on(
      'initial-state-response',
      ({
        roomId,
        stage,
        initialState,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
        initialState: unknown;
      }) => {
        server.to(roomId).emit('initial-state-response', {
          roomId,
          stage,
          initialState,
        });
      },
    );
  }
  // 자동 단계 진행: 모든 참여자가 준비 완료 시 다음 단계로 이동
  handleAutoProgressAnnouncement(server: Server) {
    this.handleAutoProgress(
      server,
      'announcement:',
      AnnouncementStageMap,
      (roomId) => this.persistAnnouncementResult(server, roomId),
    );
  }

  handleAutoProgressInvitation(server: Server) {
    this.handleAutoProgress(
      server,
      'invitation:',
      InvitationStageMap,
      (roomId) => this.persistInvitationResult(server, roomId),
    );
  }

  /**
   * 공고·초대 공통 단계 진행.
   * - 늦게 온(이미 지난 단계의) 완료와, Spring 저장을 기다리는 동안 겹친 완료는 무시한다.
   * - finish 로 넘어가기 전에 Spring 저장을 await 한다. 실패하면 단계를 넘기지 않고
   *   meeting-save-failed 를 보내며 준비를 풀어 다시 시도하게 한다.
   * - finish 단계에서 모두 준비하면 meeting-saved 후 방을 지운다.
   */
  private handleAutoProgress<S extends string>(
    server: Server,
    prefix: string,
    stageMap: Record<S, number>,
    persist: (roomId: string) => Promise<void>,
  ) {
    const emitter = this.roomService.getEventEmitter();
    const finalStageNum = Math.max(...Object.values<number>(stageMap));
    const progress = async ({
      roomId,
      stage,
    }: {
      roomId: string;
      stage: S;
    }) => {
      if (!roomId.startsWith(prefix)) return;
      if (this.roomService.getStage(roomId) !== stage) {
        this.logger.log(
          `Ignored stale completion for room ${roomId} (stage ${stage})`,
        );
        return;
      }
      if (!this.roomService.beginTransition(roomId)) {
        this.logger.log(
          `Ignored duplicate completion for room ${roomId} (stage ${stage})`,
        );
        return;
      }
      try {
        const current = stageMap[stage];
        const nextStage = (Object.entries(stageMap) as [S, number][]).find(
          (entry) => entry[1] === current + 1,
        )?.[0];

        if (current < finalStageNum && nextStage) {
          if (nextStage === 'finish') await persist(roomId);
          this.roomService.setStage(
            roomId,
            nextStage as unknown as AnnouncementStage | InvitationStage,
          );
          emitter.emit('request-initial-state', { roomId, stage: nextStage });
          this.roomService.resetParticipantsReadyState(roomId);
          server.to(roomId).emit('stage-changed', {
            stage: nextStage,
            updatedAt: Date.now(),
          });
          server.to(roomId).emit('ready-state-changed', {
            readyCount: this.roomService.getParticipantReadyCount(roomId),
            participantCount: this.roomService.getParticipantCount(roomId),
          });
          server
            .to(roomId)
            .emit(
              'participants',
              Array.from(this.roomService.getParticipants(roomId).values()),
            );
          this.logger.log(
            `Room ${roomId} auto-progressed from stage ${current} to ${nextStage}`,
          );
        } else {
          this.logger.log(`Room ${roomId} already at final stage ${current}`);
          server.to(roomId).emit('meeting-saved');
          this.roomService.deleteRoom(roomId);
        }
      } catch (error) {
        this.roomService.resetParticipantsReadyState(roomId);
        server.to(roomId).emit('meeting-save-failed');
        server.to(roomId).emit('ready-state-changed', {
          readyCount: 0,
          participantCount: this.roomService.getParticipantCount(roomId),
        });
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to auto progress stage for room ${roomId}: ${errorMessage}`,
        );
      } finally {
        this.roomService.endTransition(roomId);
      }
    };
    emitter.on(
      'ready-state-completed',
      (event: { roomId: string; stage: S }) => {
        void progress(event);
      },
    );
  }

  /** Spring 이 이미 다른 값으로 확정했다고 하면(409 data) 그 값을 방 확정값으로 맞춘다 */
  private adoptRestaurant(final: FinalState, name: string): boolean {
    const current = final.restaurant as
      | (Restaurant & { place_name?: string })
      | undefined;
    if (current?.name === name) return false;
    final.restaurant = {
      ...(current ?? { id: '', lat: 0, lng: 0 }),
      name,
      place_name: name, // 화면은 place_name 으로 표시한다
    } as unknown as Restaurant;
    return true;
  }

  private async persistAnnouncementResult(server: Server, roomId: string) {
    const final = this.roomService.getFinalState(roomId);
    const restaurant = final?.restaurant?.name;
    if (!final || !restaurant)
      throw new Error('A confirmed restaurant is required');
    const stored = await this.serverService.saveConfirmedRestaurant(
      roomId.slice('announcement:'.length),
      restaurant,
    );
    if (stored?.restaurant && this.adoptRestaurant(final, stored.restaurant)) {
      this.logger.log(
        `Room ${roomId} adopted stored restaurant from Spring (409)`,
      );
      server
        .to(roomId)
        .emit('final-state-response', { roomId, finalState: final });
    }
  }

  private async persistInvitationResult(server: Server, roomId: string) {
    const id = roomId.slice('invitation:'.length);
    if (!/^\d+$/.test(id)) throw new Error(`Invalid invitation id ${id}`);
    const final = this.roomService.getFinalState(roomId);
    const meetingAt = toKstOffsetDateTime(final?.date, final?.time);
    const location = final?.location?.placeName;
    const restaurant = final?.restaurant?.name;
    if (!final || !meetingAt || !location || !restaurant)
      throw new Error(
        `Invitation result is incomplete (meetingAt=${meetingAt}, location=${location}, restaurant=${restaurant})`,
      );
    const stored = await this.serverService.saveInvitationResult(id, {
      meetingAt,
      location,
      restaurant,
    });
    if (!stored) return;
    let changed = false;
    if (stored.restaurant)
      changed = this.adoptRestaurant(final, stored.restaurant) || changed;
    if (
      stored.location &&
      final.location &&
      final.location.placeName !== stored.location
    ) {
      final.location = { ...final.location, placeName: stored.location };
      changed = true;
    }
    const when = stored.meetingAt
      ? fromOffsetDateTime(stored.meetingAt)
      : undefined;
    if (when && stored.meetingAt !== meetingAt) {
      final.date = when.date;
      final.time = when.time;
      changed = true;
    }
    if (changed) {
      this.logger.log(`Room ${roomId} adopted stored result from Spring (409)`);
      server
        .to(roomId)
        .emit('final-state-response', { roomId, finalState: final });
    }
  }
}
