import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  UserInfo,
  PhaseChangeBroadcast,
  PhaseDataBroadcastPayload,
} from './types';
import type {
  ChatMessage,
  JoinRoomPayload,
  LeaveRoomPayload,
  RequestPhaseChangePayload,
} from './types';
import { RoomService } from './services/room.service';
import { ChatService } from './services/chat.service';
import { PhaseService } from './services/phase.service';
import { GuardService } from './services/guard.service';

@WebSocketGateway({
  cors: {
    origin: '*', // 개발 환경에서는 모든 origin 허용, 프로덕션에서는 특정 도메인으로 제한
    methods: ['GET', 'POST'],
  },
  namespace: '/',
})
export class PromiseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
    private readonly phaseService: PhaseService,
    private readonly guardService: GuardService,
  ) {}

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // 연결이 끊어진 클라이언트의 방에서 제거
    const userInfo = this.roomService.removeUserFromAnyRoom(client.id);
    if (userInfo) {
      const roomId = this.roomService.getUserRoomId(client.id);
      if (roomId) {
        this.roomService.removeUserFromRoom(roomId, client.id);
      }
    }
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { userId, nickname, roomId } = payload;
    const userInfo: UserInfo = { userId, nickname };

    // 권한 확인
    const permissionCheck = this.guardService.canJoinRoom(
      roomId,
      userInfo,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(`Join room denied: ${permissionCheck.reason}`);
      return;
    }

    // 기존 방에서 제거 (중복 join 방지)
    const existingRoomId = this.roomService.getUserRoomId(client.id);
    if (existingRoomId && existingRoomId !== roomId) {
      this.roomService.removeUserFromRoom(existingRoomId, client.id);
    }

    // 새 방에 참가
    this.roomService.addUserToRoom(roomId, client.id, userInfo);

    // 방에 참가
    client.join(roomId);

    // 방의 모든 클라이언트에게 새 유저 입장 브로드캐스트
    client.to(roomId).emit('join-room', userInfo);

    console.log(`User ${nickname} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ) {
    const { userId, nickname, roomId } = payload;

    // 권한 확인
    const permissionCheck = this.guardService.canLeaveRoom(
      roomId,
      client.id,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(`Leave room denied: ${permissionCheck.reason}`);
      return;
    }

    const userInfo = this.roomService.removeUserFromRoom(roomId, client.id);
    if (userInfo) {
      client.leave(roomId);
      client.to(roomId).emit('leave-room', userInfo);
      console.log(`User ${nickname} left room ${roomId}`);
    }
  }

  @SubscribeMessage('chat-message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessage,
  ) {
    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      return;
    }

    // 권한 확인
    const permissionCheck = this.guardService.canSendChatMessage(
      client.id,
      payload.senderId,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(`Chat message denied: ${permissionCheck.reason}`);
      return;
    }

    // 채팅 서비스에 메시지 저장
    this.chatService.addMessage(roomId, payload);

    // 방의 모든 클라이언트에게 채팅 메시지 브로드캐스트
    client.to(roomId).emit('chat', payload);
    console.log(
      `Chat message from ${payload.nickname} in room ${roomId}: ${payload.message}`,
    );
  }

  @SubscribeMessage('request-phase-change')
  handleRequestPhaseChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RequestPhaseChangePayload,
  ) {
    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      return;
    }

    // 권한 확인
    const permissionCheck = this.guardService.canRequestPhaseChange(
      client.id,
      payload.requester.userId,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(`Phase change request denied: ${permissionCheck.reason}`);
      return;
    }

    // 현재 단계 가져오기
    const currentPhase = this.roomService.getRoomPhase(roomId);

    // 단계 변경 요청 처리
    const result = this.phaseService.requestPhaseChange(
      roomId,
      payload.requester,
      payload.targetPhase,
      currentPhase,
    );

    if (result.success) {
      // 방의 모든 클라이언트에게 단계 변경 브로드캐스트
      this.server.to(roomId).emit('phase-change', result.broadcast);

      // 방의 단계 업데이트
      this.roomService.setRoomPhase(roomId, payload.targetPhase);

      console.log(
        `Phase change approved: ${currentPhase} -> ${payload.targetPhase} by ${payload.requester.nickname} in room ${roomId}`,
      );
    } else {
      console.log(`Phase change denied: ${result.reason}`);
    }
  }

  @SubscribeMessage('update-phase-data')
  handleUpdatePhaseData(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Partial<PhaseDataBroadcastPayload>,
  ) {
    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      return;
    }

    // 사용자 정보 가져오기
    const room = this.roomService.createOrGetRoom(roomId);
    const userInfo = room.users.get(client.id);
    if (!userInfo) {
      return;
    }

    // 권한 확인
    const permissionCheck = this.guardService.canModifyPhaseData(
      client.id,
      userInfo.userId,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(`Phase data update denied: ${permissionCheck.reason}`);
      return;
    }

    // 데이터 검증 및 정리
    const sanitizedData = this.phaseService.sanitizePhaseData(
      payload.data || {},
    );

    // 현재 단계 데이터와 병합
    const currentPhaseData = this.roomService.getRoomPhaseData(roomId);
    const mergedData = this.phaseService.mergePhaseData(
      currentPhaseData,
      sanitizedData,
    );

    // 방의 단계 데이터 업데이트
    this.roomService.updateRoomPhaseData(roomId, mergedData);

    // 방의 모든 클라이언트에게 단계 데이터 동기화
    const broadcastPayload: PhaseDataBroadcastPayload = {
      phase: this.roomService.getRoomPhase(roomId),
      data: mergedData,
    };

    this.server.to(roomId).emit('phase-data', broadcastPayload);
    console.log(`Phase data updated by ${userInfo.nickname} in room ${roomId}`);
  }
}
