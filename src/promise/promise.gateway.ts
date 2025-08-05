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
  @WebSocketServer()
  server: Server;

  // 방별 참가자 관리 (메모리 저장소)
  private rooms: Map<string, Set<UserInfo>> = new Map();

  // Socket ID와 UserInfo 매핑
  private socketToUser: Map<string, UserInfo> = new Map();

  // Socket ID와 방 ID 매핑
  private socketToRoom: Map<string, string> = new Map();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // 연결이 끊어진 클라이언트의 방에서 제거
    const roomId = this.socketToRoom.get(client.id);
    const userInfo = this.socketToUser.get(client.id);

    if (roomId && userInfo) {
      this.leaveRoom(client, {
        userId: userInfo.userId,
        nickname: userInfo.nickname,
        roomId,
      });
    }

    // 매핑 정보 정리
    this.socketToUser.delete(client.id);
    this.socketToRoom.delete(client.id);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { userId, nickname, roomId } = payload;
    const userInfo: UserInfo = { userId, nickname };

    // 기존 방에서 제거 (중복 join 방지)
    const existingRoomId = this.socketToRoom.get(client.id);
    if (existingRoomId && existingRoomId !== roomId) {
      this.leaveRoom(client, { userId, nickname, roomId: existingRoomId });
    }

    // 새 방에 참가
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId)!.add(userInfo);
    this.socketToUser.set(client.id, userInfo);
    this.socketToRoom.set(client.id, roomId);

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
    this.leaveRoom(client, payload);
  }

  @SubscribeMessage('chat-message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessage,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      return;
    }

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
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      return;
    }

    // TODO: 단계 변경 로직 구현
    const phaseChangeBroadcast: PhaseChangeBroadcast = {
      next: [payload.requester],
    };

    // 방의 모든 클라이언트에게 단계 변경 브로드캐스트
    this.server.to(roomId).emit('phase-change', phaseChangeBroadcast);
    console.log(
      `Phase change requested by ${payload.requester.nickname} in room ${roomId}`,
    );
  }

  @SubscribeMessage('update-phase-data')
  handleUpdatePhaseData(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Partial<PhaseDataBroadcastPayload>,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const userInfo = this.socketToUser.get(client.id);

    if (!roomId || !userInfo) {
      return;
    }

    // TODO: 데이터 검증 및 업데이트 로직 구현
    // TODO: GuardService를 통한 본인 데이터만 수정 가능하도록 제어

    // 방의 모든 클라이언트에게 단계 데이터 동기화
    this.server.to(roomId).emit('phase-data', payload);
    console.log(`Phase data updated by ${userInfo.nickname} in room ${roomId}`);
  }

  private leaveRoom(client: Socket, payload: LeaveRoomPayload) {
    const { userId, nickname, roomId } = payload;
    const userInfo: UserInfo = { userId, nickname };

    // 방에서 유저 제거
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(userInfo);

      // 방이 비어있으면 방 삭제
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    // 방에서 나가기
    client.leave(roomId);

    // 방의 모든 클라이언트에게 유저 퇴장 브로드캐스트
    client.to(roomId).emit('leave-room', userInfo);

    console.log(`User ${nickname} left room ${roomId}`);
  }
}
