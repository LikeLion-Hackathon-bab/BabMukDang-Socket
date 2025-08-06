import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Server } from 'socket.io';
import type { UserInfo } from '../types/user.types';
import type { ExtendedSocket, ChatMessage } from '../types/socket.types';
import type { RequestPhaseChangePayload } from '../types/phase.types';
import { RoomService, ChatService, PhaseService } from './services';
import { UserOwnershipGuard, WsGuard } from './guards';
import {
  LoggingInterceptor,
  DataOwnershipInterceptor,
  ErrorHandlingInterceptor,
} from './interceptors';
import { UserInfoDto, RoomIdDto, PhaseDataDto } from './dto';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/announcement',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
@UseInterceptors(LoggingInterceptor, ErrorHandlingInterceptor)
@UseGuards(WsGuard)
export class PromiseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly roomService: RoomService,
    private readonly chatService: ChatService,
    private readonly phaseService: PhaseService,
    private readonly jwtService: JwtService,
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
  /**
   * 토큰 검증
   */
  private verifyToken(token: string): UserInfo {
    const verify = this.jwtService.verify(token, {
      secret: process.env.JWT_SECRET,
    });
    if (!verify) {
      throw new UnauthorizedException('인증이 유효하지 않습니다. ');
    } else {
      return verify;
    }
  }

  handleConnection(client: ExtendedSocket) {
    const roomId = client.handshake.query.roomId as string;
    const token = client.handshake.auth.token;
    let userInfo: UserInfo | undefined;
    if (!token) {
      client.disconnect();
      return;
    } else {
      userInfo = this.verifyToken(token);
    }
    const logPrefix = this.getLogPrefix(client);

    if (!roomId) {
      console.log(`${logPrefix} Client connected without roomId`);
      client.disconnect();
      return;
    }
    const existingRoomId = this.roomService.getUserRoomId(client);
    if (existingRoomId && existingRoomId !== roomId) {
      this.roomService.removeUserFromRoom(this.server, existingRoomId, client);
    }
    if (userInfo) {
      client.join(roomId);
      this.roomService.addUserToRoom(this.server, roomId, client, userInfo);
      client.to(roomId).emit('join-room', userInfo);
      console.log(
        `${logPrefix} User ${userInfo.username} joined room ${roomId}`,
      );
    }
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

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: UserInfoDto & RoomIdDto,
  ) {
    const { username, roomId } = payload;
    const logPrefix = this.getLogPrefix(client);

    const userInfo = this.roomService.removeUserFromRoom(
      this.server,
      roomId,
      client,
    );
    if (userInfo) {
      client.to(roomId).emit('leave-room', userInfo);
      console.log(`${logPrefix} User ${username} left room ${roomId}`);
    }
  }

  @SubscribeMessage('chat-message')
  @UseGuards(UserOwnershipGuard)
  @UseInterceptors(DataOwnershipInterceptor)
  handleChatMessage(
    @ConnectedSocket() client: ExtendedSocket,
    @MessageBody() payload: ChatMessage,
  ) {
    const { username, message } = payload;
    const logPrefix = this.getLogPrefix(client);

    const roomId = this.roomService.getUserRoomId(client);
    if (!roomId) {
      return;
    }

    this.chatService.addMessage(roomId, payload);
    client.to(roomId).emit('chat-message', payload);
    console.log(`${logPrefix} Chat message from ${username}: ${message}`);
  }

  @SubscribeMessage('request-phase-change')
  @UseGuards(UserOwnershipGuard)
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
  @UseGuards(UserOwnershipGuard)
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

      console.log(`${logPrefix} Phase data updated in room ${roomId}`);
    }
  }
}
