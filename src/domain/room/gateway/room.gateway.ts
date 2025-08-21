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

@Injectable()
export class RoomHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly roomService: RoomStoreService,
  ) {}

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
    client.emit('ready-state-success', {
      roomId,
      userId: userInfo.userId,
      isReady,
      timestamp: Date.now(),
    });
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
        initialState: any;
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
    const emitter = this.roomService.getEventEmitter();
    emitter.on(
      'ready-state-completed',
      ({
        roomId,
        stage,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
      }) => {
        if (!roomId.startsWith('announcement:')) return;
        try {
          const current = AnnouncementStageMap[stage];
          // TODO: 동점 처리 로직 고려 (예: 특정 도메인의 투표 결과가 동점인 경우 재투표/타이브레이커)
          const next = current + 1;
          const nextStage = Object.entries(AnnouncementStageMap).find(
            (entry) => entry[1] === next,
          )?.[0] as AnnouncementStage;

          if (current < 7) {
            this.roomService.setStage(roomId, nextStage);
            emitter.emit('request-initial-state', {
              roomId,
              stage: nextStage,
            });
            // 다음 단계로 넘어갈 때 준비 상태 초기화
            this.roomService.resetParticipantsReadyState(roomId);
            // 클라이언트에게 단계 변경 및 참여자 상태 방송 (정확한 네임스페이스 서버 사용)
            server.to(roomId).emit('stage-changed', {
              stage: nextStage,
              updatedAt: Date.now(),
            });
            server.to(roomId).emit('ready-state-changed', {
              readyCount: this.roomService.getParticipantReadyCount(roomId),
              participantCount: this.roomService.getParticipantCount(roomId),
            });
            const participants = Array.from(
              this.roomService.getParticipants(roomId).values(),
            );
            server.to(roomId).emit('participants', participants);
            this.logger.log(
              `Room ${roomId} auto-progressed from stage ${current} to ${nextStage}`,
            );
          } else {
            // 최종 단계에서는 추가 진행 없음. 필요 시 완료 이벤트 방송 가능
            this.logger.log(`Room ${roomId} already at final stage ${current}`);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to auto progress stage for room ${roomId}: ${errorMessage}`,
          );
        }
      },
    );
  }
  handleAutoProgressInvitation(server: Server) {
    const emitter = this.roomService.getEventEmitter();
    emitter.on(
      'ready-state-completed',
      ({
        roomId,
        stage,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
      }) => {
        if (!roomId.startsWith('invitation:')) return;
        try {
          const current = InvitationStageMap[stage];
          // TODO: 동점 처리 로직 고려 (예: 특정 도메인의 투표 결과가 동점인 경우 재투표/타이브레이커)
          const next = current + 1;
          const nextStage = Object.entries(InvitationStageMap).find(
            (entry) => entry[1] === next,
          )?.[0] as InvitationStage;

          if (current < 9) {
            this.roomService.setStage(roomId, nextStage);
            emitter.emit('request-initial-state', {
              roomId,
              stage: nextStage,
            });
            // 다음 단계로 넘어갈 때 준비 상태 초기화
            this.roomService.resetParticipantsReadyState(roomId);
            // 클라이언트에게 단계 변경 및 참여자 상태 방송 (정확한 네임스페이스 서버 사용)
            server.to(roomId).emit('stage-changed', {
              stage: nextStage,
              updatedAt: Date.now(),
            });
            server.to(roomId).emit('ready-state-changed', {
              readyCount: this.roomService.getParticipantReadyCount(roomId),
              participantCount: this.roomService.getParticipantCount(roomId),
            });
            const participants = Array.from(
              this.roomService.getParticipants(roomId).values(),
            );
            server.to(roomId).emit('participants', participants);
            this.logger.log(
              `Room ${roomId} auto-progressed from stage ${current} to ${nextStage}`,
            );
          } else {
            // 최종 단계에서는 추가 진행 없음. 필요 시 완료 이벤트 방송 가능
            this.logger.log(`Room ${roomId} already at final stage ${current}`);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed to auto progress stage for room ${roomId}: ${errorMessage}`,
          );
        }
      },
    );
  }
}
