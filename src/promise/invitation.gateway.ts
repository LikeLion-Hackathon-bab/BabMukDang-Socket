import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UserInfo, PhaseDataBroadcastPayload } from './types';
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
import { RoomAccessGuard, UserOwnershipGuard } from './guards';
import { LoggingInterceptor, DataOwnershipInterceptor } from './interceptors';
import {
  UserInfoValidationPipe,
  RoomIdValidationPipe,
  PhaseDataValidationPipe,
} from './pipes';

@WebSocketGateway({
  namespace: '/invitation',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
@UseInterceptors(LoggingInterceptor)
export class InvitationGateway
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
    const roomId = client.handshake.query.roomId as string;
    if (!roomId) {
      console.log(`[invitation] Client connected without roomId`);
      return;
    }
    client.join(roomId);
    console.log(`[invitation] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[invitation] Client disconnected: ${client.id}`);
    const userInfo = this.roomService.removeUserFromAnyRoom(client.id);
    if (userInfo) {
      const roomId = this.roomService.getUserRoomId(client.id);
      if (roomId) {
        this.roomService.removeUserFromRoom(roomId, client.id);
      }
    }
  }

  @SubscribeMessage('join-room')
  @UsePipes(UserInfoValidationPipe, RoomIdValidationPipe)
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { userId, nickname, roomId } = payload;
    const userInfo: UserInfo = { userId, nickname };

    const existingRoomId = this.roomService.getUserRoomId(client.id);
    if (existingRoomId && existingRoomId !== roomId) {
      this.roomService.removeUserFromRoom(existingRoomId, client.id);
    }

    this.roomService.addUserToRoom(roomId, client.id, userInfo);
    client.join(roomId);
    client.to(roomId).emit('join-room', userInfo);
    console.log(`[invitation] User ${nickname} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  @UseGuards(RoomAccessGuard)
  @UsePipes(UserInfoValidationPipe, RoomIdValidationPipe)
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveRoomPayload,
  ) {
    const { nickname, roomId } = payload;

    const userInfo = this.roomService.removeUserFromRoom(roomId, client.id);
    if (userInfo) {
      client.leave(roomId);
      client.to(roomId).emit('leave-room', userInfo);
      console.log(`[invitation] User ${nickname} left room ${roomId}`);
    }
  }

  @SubscribeMessage('chat-message')
  @UseGuards(RoomAccessGuard, UserOwnershipGuard)
  @UseInterceptors(DataOwnershipInterceptor)
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessage,
  ) {
    const { nickname, message } = payload;

    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      return;
    }

    this.chatService.addMessage(roomId, payload);
    client.to(roomId).emit('chat-message', payload);
    console.log(`[invitation] Chat message from ${nickname}: ${message}`);
  }

  @SubscribeMessage('request-phase-change')
  @UseGuards(RoomAccessGuard, UserOwnershipGuard)
  handleRequestPhaseChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RequestPhaseChangePayload,
  ) {
    const { requester, targetPhase } = payload;

    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      return;
    }

    const currentPhase = this.roomService.getRoomPhase(roomId);
    const result = this.phaseService.requestPhaseChange(
      roomId,
      requester,
      targetPhase,
      currentPhase,
    );

    if (result.success) {
      this.roomService.setRoomPhase(roomId, targetPhase);
      client.to(roomId).emit('phase-change', result.broadcast);
      console.log(
        `[invitation] Phase changed to ${targetPhase} in room ${roomId}`,
      );
    }
  }

  @SubscribeMessage('update-phase-data')
  @UseGuards(RoomAccessGuard, UserOwnershipGuard)
  @UsePipes(PhaseDataValidationPipe)
  @UseInterceptors(DataOwnershipInterceptor)
  handleUpdatePhaseData(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Partial<PhaseDataBroadcastPayload>,
  ) {
    const { phase, data } = payload;

    const roomId = this.roomService.getUserRoomId(client.id);
    if (!roomId) {
      return;
    }

    const currentPhase = this.roomService.getRoomPhase(roomId);
    if (phase !== currentPhase) {
      console.log(
        `[invitation] Phase mismatch: expected ${currentPhase}, got ${phase}`,
      );
      return;
    }

    if (data) {
      this.roomService.updateRoomPhaseData(roomId, data);
      client.to(roomId).emit('phase-data-update', payload);

      this.guardService.logDataModification(
        'unknown',
        roomId,
        'phase-data',
        'updated',
      );

      console.log(`[invitation] Phase data updated in room ${roomId}`);
    }
  }
}
