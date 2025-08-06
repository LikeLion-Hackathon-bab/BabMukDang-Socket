import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { Server } from 'socket.io';
import { UserInfo, ExtendedSocket } from '../types';
import { RoomService, ChatService, PhaseService } from './services';
import { RoomAccessGuard, UserOwnershipGuard } from './guards';
import {
  LoggingInterceptor,
  DataOwnershipInterceptor,
  ErrorHandlingInterceptor,
} from './interceptors';
import { UserInfoDto, RoomIdDto, PhaseDataDto } from './dto';

// 임시로 타입 정의
export interface ChatMessage {
  senderId: string;
  nickname: string;
  message: string;
  timestamp: number;
  phase: number;
}

export interface RequestPhaseChangePayload {
  requester: UserInfo;
  targetPhase: number;
}

@WebSocketGateway({
  namespace: '/promise',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
@UseInterceptors(LoggingInterceptor, ErrorHandlingInterceptor)
export class PromiseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
    private readonly phaseService: PhaseService,
  ) {}

  @WebSocketServer()
  server: Server;

  /**
   * 네임스페이스별 로그 prefix를 반환
   */
  private getLogPrefix(client: ExtendedSocket): string {
    const namespace = client.nsp.name;
    return `[${namespace.replace('/', '')}]`;
  }

  handleConnection(client: ExtendedSocket) {
    const roomId = client.handshake.query.roomId as string;
    const logPrefix = this.getLogPrefix(client);

    if (!roomId) {
      console.log(`${logPrefix} Client connected without roomId`);
      client.disconnect();
      return;
    }

    client.join(roomId);
    client.to(roomId).emit('join-room', {
      userId: client.id,
      nickname: 'Unknown',
      roomId: roomId,
    });
    console.log(`${logPrefix} Client connected: ${client.id}`);
  }

  handleDisconnect(client: ExtendedSocket) {
    const logPrefix = this.getLogPrefix(client);
    console.log(`${logPrefix} Client disconnected: ${client.id}`);

    const userInfo = this.roomService.removeUserFromAnyRoom(
      this.server,
      client,
    );
    if (userInfo) {
      const roomId = this.roomService.getUserRoomId(client);
      if (roomId) {
        this.roomService.removeUserFromRoom(this.server, roomId, client);
      }
    }
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: UserInfoDto & RoomIdDto,
  ) {
    const { userId, nickname, roomId } = payload;
    const userInfo: UserInfo = {
      userId,
      nickname,
      email: '', // TODO: 실제 이메일 정보 추가 필요
      role: 'user', // TODO: 실제 역할 정보 추가 필요
    };
    const logPrefix = this.getLogPrefix(client);

    const existingRoomId = this.roomService.getUserRoomId(client);
    if (existingRoomId && existingRoomId !== roomId) {
      this.roomService.removeUserFromRoom(this.server, existingRoomId, client);
    }

    this.roomService.addUserToRoom(this.server, roomId, client, userInfo);
    client.to(roomId).emit('join-room', userInfo);
    console.log(`${logPrefix} User ${nickname} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  @UseGuards(RoomAccessGuard)
  handleLeaveRoom(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: UserInfoDto & RoomIdDto,
  ) {
    const { nickname, roomId } = payload;
    const logPrefix = this.getLogPrefix(client);

    const userInfo = this.roomService.removeUserFromRoom(
      this.server,
      roomId,
      client,
    );
    if (userInfo) {
      client.to(roomId).emit('leave-room', userInfo);
      console.log(`${logPrefix} User ${nickname} left room ${roomId}`);
    }
  }

  @SubscribeMessage('chat-message')
  @UseGuards(RoomAccessGuard, UserOwnershipGuard)
  @UseInterceptors(DataOwnershipInterceptor)
  handleChatMessage(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: ChatMessage,
  ) {
    const { nickname, message } = payload;
    const logPrefix = this.getLogPrefix(client);

    const roomId = this.roomService.getUserRoomId(client);
    if (!roomId) {
      return;
    }

    this.chatService.addMessage(roomId, payload);
    client.to(roomId).emit('chat-message', payload);
    console.log(`${logPrefix} Chat message from ${nickname}: ${message}`);
  }

  @SubscribeMessage('request-phase-change')
  @UseGuards(RoomAccessGuard, UserOwnershipGuard)
  handleRequestPhaseChange(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: RequestPhaseChangePayload,
  ) {
    const { requester, targetPhase } = payload;
    const logPrefix = this.getLogPrefix(client);

    const roomId = this.roomService.getUserRoomId(client);
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
        `${logPrefix} Phase changed to ${targetPhase} in room ${roomId}`,
      );
    }
  }

  @SubscribeMessage('update-phase-data')
  @UseGuards(RoomAccessGuard, UserOwnershipGuard)
  @UseInterceptors(DataOwnershipInterceptor)
  handleUpdatePhaseData(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: PhaseDataDto,
  ) {
    const { phase, data } = payload;
    const logPrefix = this.getLogPrefix(client);

    const roomId = this.roomService.getUserRoomId(client);
    if (!roomId) {
      return;
    }

    const currentPhase = this.roomService.getRoomPhase(roomId);
    if (phase !== currentPhase) {
      console.log(
        `${logPrefix} Phase mismatch: expected ${currentPhase}, got ${phase}`,
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

      console.log(`${logPrefix} Phase data updated in room ${roomId}`);
    }
  }
}
