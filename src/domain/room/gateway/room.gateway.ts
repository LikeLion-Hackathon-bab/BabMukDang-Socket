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
import { RoomClosedError, ServerService } from '../services/server.service';
import {
  fromOffsetDateTime,
  toKstOffsetDateTime,
} from '../services/meeting-time';
import type { Restaurant } from 'src/domain/restaurant/types/restaurant.type';
import { checkStageOutcome, type StageRetry } from '../services/stage-outcome';

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

    const accepted = this.roomService.updateParticipantReadyState(
      roomId,
      userInfo.userId,
      isReady,
    );
    if (!accepted) {
      // 저장 대기 중이라 바꾸지 않았다. 보낸 사람 화면을 서버 상태로 되돌린다.
      client.emit('ready-state-changed', {
        readyCount: this.roomService.getParticipantReadyCount(roomId),
        participantCount: this.roomService.getParticipantCount(roomId),
      });
      return;
    }
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
  /**
   * 카운트다운·단계 전이 중에는 표·선택 변경을 받지 않는다(S1).
   * 거부했으면 true. 보낸 사람이 화면을 서버 상태로 되돌릴 수 있게 현재 단계 상태를 다시 보낸다.
   */
  rejectIfLocked(client: Socket, roomId: string): boolean {
    if (!this.roomService.isLocked(roomId)) return false;
    this.logger.log(
      `Rejected change from ${client.id} in locked room ${roomId}`,
    );
    this.roomService.getStageState(roomId);
    const final = this.roomService.getFinalState(roomId);
    if (final)
      client.emit('final-state-response', { roomId, finalState: final });
    return true;
  }

  /**
   * 재접속한 화면은 stage-changed 를 받고 준비를 해제한다. 서버도 맞추고,
   * 준비였던 사람이면 남은 사람들의 준비 수도 갱신한다(S4·S5).
   */
  syncReadyOnReconnect(
    server: Server,
    client: Socket,
    roomId: string,
    userId: string,
  ) {
    const me = this.roomService.getParticipants(roomId).get(userId);
    const wasReady = me?.ready === true;
    if (wasReady)
      this.roomService.updateParticipantReadyState(roomId, userId, false);
    const readyState = {
      readyCount: this.roomService.getParticipantReadyCount(roomId),
      participantCount: this.roomService.getParticipantCount(roomId),
    };
    if (wasReady) server.to(roomId).emit('ready-state-changed', readyState);
    else client.emit('ready-state-changed', readyState);
  }

  /** 참여 취소·방 해산을 방에 알린다 (contracts/room-leave-events.md) */
  handleRoomLifecycle(server: Server) {
    const emitter = this.roomService.getEventEmitter();
    emitter.on(
      'room-participant-left',
      ({ roomId, userId }: { roomId: string; userId: string }) => {
        void server
          .in(roomId)
          .fetchSockets()
          .then((sockets) => {
            for (const s of sockets)
              if ((s.data as { userId?: string })?.userId === userId) {
                s.emit('room-left', { roomId: roomId.split(':')[1] });
                s.disconnect(true);
              }
          })
          .catch(() => {});
        const participants = Array.from(
          this.roomService.getParticipants(roomId).values(),
        );
        const room = this.roomService.getRoom(roomId);
        server.to(roomId).emit('leave-room', participants);
        // 기존 Client 는 이 응답의 participants 로 명단을 갱신한다(입장 때와 같은 모양)
        server.to(roomId).emit('initial-state-response', {
          participants,
          locationInitial: room?.locationInitial,
          meetingAt: room?.meetingAt,
        });
        server.to(roomId).emit('ready-state-changed', {
          readyCount: 0,
          participantCount: participants.length,
        });
      },
    );
    emitter.on(
      'room-dissolved',
      ({ roomId, reason }: { roomId: string; reason: string }) => {
        server.to(roomId).emit('room-dissolved', {
          roomId: roomId.split(':')[1],
          reason,
          message:
            reason === 'participant-left'
              ? '함께하던 친구가 나가서 대기실이 닫혔어요.'
              : '이 대기실은 더 이상 진행할 수 없어요.',
        });
        server.in(roomId).disconnectSockets(true);
      },
    );
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
      const room = this.roomService.getRoom(roomId);
      try {
        const current = stageMap[stage];
        // 판정과 확정값이 같은 시점의 표를 보도록 지금 다시 계산한다(S1)
        emitter.emit('request-final-state', { roomId, stage });
        const nextStage = (Object.entries(stageMap) as [S, number][]).find(
          (entry) => entry[1] === current + 1,
        )?.[0];

        // F55·F60: 결과가 정해지지 않았으면(동점, 공통 날짜·시간 없음) 다음 단계로 가지 않는다
        const retry = checkStageOutcome(
          this.roomService.getRoom(roomId),
          stage,
        );
        if (retry) {
          this.retryStage(server, roomId, stage, retry);
          return;
        }
        if (current < finalStageNum && nextStage) {
          if (nextStage === 'finish') {
            await persist(roomId);
            // 저장을 기다리는 동안 방이 해산·재생성됐으면 새 방을 건드리지 않는다(S14)
            if (this.roomService.getRoom(roomId) !== room) return;
          }
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
        if (this.roomService.getRoom(roomId) !== room) return;
        if (error instanceof RoomClosedError) {
          // 공고가 다시 모집 중이거나 초대가 취소됨: 확정이 아니므로 방을 닫는다
          this.logger.log(`Room ${roomId} closed by Spring: ${error.message}`);
          this.roomService.closeRoom(roomId, 'closed-by-server');
          return;
        }
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
        if (this.roomService.getRoom(roomId) === room)
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

  private retryStage(
    server: Server,
    roomId: string,
    stage: string,
    retry: StageRetry,
  ) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;
    if (retry.retryStage !== stage) {
      // 공통 시간 없음 → 날짜부터 다시. 날짜 선택은 남겨 고칠 수 있게, 시간 선택·확정값은 비운다
      room.time = undefined;
      room.final.time = '';
      room.final.date = '';
      this.roomService.setStage(
        roomId,
        retry.retryStage as AnnouncementStage | InvitationStage,
      );
    }
    this.roomService.resetParticipantsReadyState(roomId);
    this.roomService
      .getEventEmitter()
      .emit('request-initial-state', { roomId, stage: retry.retryStage });
    server.to(roomId).emit('stage-changed', {
      stage: retry.retryStage,
      updatedAt: Date.now(),
      reason: retry.reason,
      message: retry.message,
    });
    server.to(roomId).emit('ready-state-changed', {
      readyCount: 0,
      participantCount: this.roomService.getParticipantCount(roomId),
    });
    this.logger.log(
      `Room ${roomId} stays for re-selection at ${retry.retryStage} (${retry.reason} at ${stage})`,
    );
  }

  /**
   * Spring 이 이미 다른 값으로 확정했다고 하면(409 data) 그 값을 방 확정값으로 맞춘다.
   * 같은 이름의 후보가 있으면 그 후보를 통째로 쓰고, 없으면 id·좌표·주소를 비운다(리뷰 S6).
   */
  private adoptRestaurant(
    roomId: string,
    final: FinalState,
    name: string,
  ): boolean {
    const current = final.restaurant as
      | (Restaurant & { place_name?: string })
      | undefined;
    if (current?.name === name) return false;
    const known = this.roomService
      .getRoom(roomId)
      ?.restaurant?.initialRestaurants.find((r) => r.name === name);
    final.restaurant = {
      ...(known ?? { id: '', lat: 0, lng: 0 }),
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
    const sent = structuredClone(final.restaurant);
    const stored = await this.serverService.saveConfirmedRestaurant(
      roomId.slice('announcement:'.length),
      restaurant,
    );
    // 보낸 값으로 고정한다. 기다리는 동안 바뀌었으면 Spring 에 저장된 값으로 되돌려 알린다(S1)
    const drifted = JSON.stringify(final.restaurant) !== JSON.stringify(sent);
    final.restaurant = sent;
    if (
      stored?.restaurant &&
      this.adoptRestaurant(roomId, final, stored.restaurant)
    ) {
      this.logger.log(
        `Room ${roomId} adopted stored restaurant from Spring (409)`,
      );
      server
        .to(roomId)
        .emit('final-state-response', { roomId, finalState: final });
    } else if (drifted) {
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
    const sent = structuredClone({
      date: final.date,
      time: final.time,
      location: final.location,
      restaurant: final.restaurant,
    });
    const stored = await this.serverService.saveInvitationResult(id, {
      meetingAt,
      location,
      restaurant,
    });
    // 보낸 값으로 고정한다(S1)
    let changed =
      JSON.stringify({
        date: final.date,
        time: final.time,
        location: final.location,
        restaurant: final.restaurant,
      }) !== JSON.stringify(sent);
    Object.assign(final, sent);
    if (!stored) {
      if (changed)
        server
          .to(roomId)
          .emit('final-state-response', { roomId, finalState: final });
      return;
    }
    if (stored.restaurant)
      changed =
        this.adoptRestaurant(roomId, final, stored.restaurant) || changed;
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
