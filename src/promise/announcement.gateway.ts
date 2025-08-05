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
  namespace: '/announcement',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class AnnouncementGateway
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
    console.log(`[announcement] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[announcement] Client disconnected: ${client.id}`);
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
    const permissionCheck = this.guardService.canJoinRoom(
      roomId,
      userInfo,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(`[announcement] Join room denied: ${permissionCheck.reason}`);
      return;
    }
    const existingRoomId = this.roomService.getUserRoomId(client.id);
    if (existingRoomId && existingRoomId !== roomId) {
      this.roomService.removeUserFromRoom(existingRoomId, client.id);
    }
    this.roomService.addUserToRoom(roomId, client.id, userInfo);
    client.join(roomId);
    client.to(roomId).emit('join-room', userInfo);
    console.log(`[announcement] User ${nickname} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ) {
    const { userId, nickname, roomId } = payload;
    const permissionCheck = this.guardService.canLeaveRoom(
      roomId,
      client.id,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(
        `[announcement] Leave room denied: ${permissionCheck.reason}`,
      );
      return;
    }
    const userInfo = this.roomService.removeUserFromRoom(roomId, client.id);
    if (userInfo) {
      client.leave(roomId);
      client.to(roomId).emit('leave-room', userInfo);
      console.log(`[announcement] User ${nickname} left room ${roomId}`);
    }
  }

  @SubscribeMessage('chat-message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessage,
  ) {
    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) return;
    const permissionCheck = this.guardService.canSendChatMessage(
      client.id,
      payload.senderId,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(
        `[announcement] Chat message denied: ${permissionCheck.reason}`,
      );
      return;
    }
    this.chatService.addMessage(roomId, payload);
    client.to(roomId).emit('chat', payload);
    console.log(
      `[announcement] Chat message from ${payload.nickname} in room ${roomId}: ${payload.message}`,
    );
  }

  @SubscribeMessage('request-phase-change')
  handleRequestPhaseChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RequestPhaseChangePayload,
  ) {
    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) return;
    // announcement 네임스페이스는 시간 정하기(1단계) 없이 시작 (2단계부터)
    const currentPhase = Math.max(this.roomService.getRoomPhase(roomId), 2);
    const permissionCheck = this.guardService.canRequestPhaseChange(
      client.id,
      payload.requester.userId,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(
        `[announcement] Phase change request denied: ${permissionCheck.reason}`,
      );
      return;
    }
    // 1단계로의 전환은 무시
    if (payload.targetPhase === 1) {
      console.log(
        `[announcement] Phase 1 (시간 정하기) is not allowed in this namespace.`,
      );
      return;
    }
    const result = this.phaseService.requestPhaseChange(
      roomId,
      payload.requester,
      payload.targetPhase,
      currentPhase,
    );
    if (result.success) {
      this.server.to(roomId).emit('phase-change', result.broadcast);
      this.roomService.setRoomPhase(roomId, payload.targetPhase);
      console.log(
        `[announcement] Phase change approved: ${currentPhase} -> ${payload.targetPhase} by ${payload.requester.nickname} in room ${roomId}`,
      );
    } else {
      console.log(`[announcement] Phase change denied: ${result.reason}`);
    }
  }

  @SubscribeMessage('update-phase-data')
  handleUpdatePhaseData(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Partial<PhaseDataBroadcastPayload>,
  ) {
    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) return;
    const room = this.roomService.createOrGetRoom(roomId);
    const userInfo = room.users.get(client.id);
    if (!userInfo) return;
    const permissionCheck = this.guardService.canModifyPhaseData(
      client.id,
      userInfo.userId,
      this.roomService,
    );
    if (!permissionCheck.allowed) {
      console.log(
        `[announcement] Phase data update denied: ${permissionCheck.reason}`,
      );
      return;
    }
    const sanitizedData = this.phaseService.sanitizePhaseData(
      payload.data || {},
    );
    const currentPhaseData = this.roomService.getRoomPhaseData(roomId);
    const mergedData = this.phaseService.mergePhaseData(
      currentPhaseData,
      sanitizedData,
    );
    this.roomService.updateRoomPhaseData(roomId, mergedData);
    const broadcastPayload: PhaseDataBroadcastPayload = {
      phase: Math.max(this.roomService.getRoomPhase(roomId), 2),
      data: mergedData,
    };
    this.server.to(roomId).emit('phase-data', broadcastPayload);
    console.log(
      `[announcement] Phase data updated by ${userInfo.nickname} in room ${roomId}`,
    );
  }
}
