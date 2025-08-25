import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { verifyToken, getWsCtx } from './utils';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService } from 'src/domain/room';
import { INVITATION_ROOM_STORE } from './invitation.handlers';
import { ChatHandlers } from 'src/domain/chat';
import { LocationHandlers } from 'src/domain/location';
import { MenuHandlers } from 'src/domain/menu';
import { RestaurantHandlers } from 'src/domain/restaurant';
import { ExcludeMenuHandlers } from 'src/domain/exclude-menu';
import { RoomHandlers } from 'src/domain/room';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { WsRoom, WsUser } from 'src/domain/common/websoket.decorator';
import type { UserInfo } from 'src/domain/common/types';
import type { ChatSendRequestDto } from 'src/domain/chat/dto';
import { MenuActionDto } from 'src/domain/menu/dto';
import { ExcludeMenuDto } from 'src/domain/exclude-menu/dto';
import { RestaurantActionDto } from 'src/domain/restaurant/dto';
import { LocationCandidateDto, CandidateIdDto } from 'src/domain/location/dto';

@WebSocketGateway({
  namespace: '/invitation',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class InvitationGateway
  implements
    OnGatewayInit,
    OnGatewayConnection<Socket>,
    OnGatewayDisconnect<Socket>
{
  constructor(
    @Inject(INVITATION_ROOM_STORE)
    private readonly roomService: RoomStoreService,
    private readonly jwtService: JwtService,
    private readonly logger: WsLogger,
    private readonly chat: ChatHandlers,
    private readonly location: LocationHandlers,
    private readonly menu: MenuHandlers,
    private readonly restaurant: RestaurantHandlers,
    private readonly excludeMenu: ExcludeMenuHandlers,
    private readonly room: RoomHandlers,
  ) {
    this.roomService.isInvitation = true;
  }

  @WebSocketServer()
  server: Server;

  // ===== 미들웨어 =====
  afterInit(server: Server) {
    this.server = server;
    // pass scoped server so broadcasting stays within this namespace
    this.room.handleAutoProgressInvitation(this.server);
    this.room.handleInitialStateResponse(this.server);
    this.room.handleFinalStateResponse(this.server);
    this.location.server = this.server;
    // this.chat.server = this.server;
    this.menu.server = this.server;
    this.restaurant.server = this.server;
    this.excludeMenu.server = this.server;
    // RoomHandlers does not hold a global server reference anymore

    server.use((socket: Socket, next) => {
      try {
        // 1) 토큰 검증 (handshake.auth.token 또는 Authorization 헤더)
        const auth = socket.handshake.auth as Record<string, unknown>;
        const token = typeof auth?.token === 'string' ? auth.token : undefined;

        if (!token) return next(new Error('Unauthorized: token missing'));

        const userInfo = verifyToken(token, this.jwtService);
        // 2) roomId 확보
        const rawRoomId = socket.handshake.query.roomId as string | undefined;
        if (!rawRoomId) return next(new Error('roomId is required'));

        // 3) (선택) 방 멤버십/권한 검증
        // const ok = await this.roomService.canJoin(roomId, payload.sub);
        // if (!ok) return next(new Error('Forbidden: not a room member'));

        // 4) socket.data에 “표준 위치”로 저장 (타이핑된 접근)
        const data = socket.data as {
          userId?: string;
          username?: string;
          roomId?: string;
        };
        data.userId = userInfo.sub;
        data.username = userInfo.username;
        // Namespace-scoped room id to isolate store/state between gateways
        const roomId = `invitation:${rawRoomId}`;
        data.roomId = roomId;

        // 기존 연결 정리
        // this.roomService.removeParticipant(socket.data.roomId, socket.data.userId);

        // 5) 최초 1회만 join 처리
        void socket.join(roomId);

        next();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Token verification failed: ${errorMessage}`);
        next(new Error('Unauthorized: invalid token'));
      }
    });
  }

  // ===== 연결 핸들러 =====
  handleConnection(client: Socket) {
    try {
      const { userInfo, roomId } = getWsCtx(client);

      // 사용자를 방에 추가
      if (userInfo && userInfo.userId && roomId) {
        this.roomService.addParticipant(
          roomId,
          userInfo.userId,
          userInfo.username,
        );
        // 채팅 메시지 전송
        const chatMessages = this.roomService.getChatMessages(roomId);
        client.emit('chat-messages', chatMessages);
        client.emit('stage-changed', {
          stage: this.roomService.getStage(roomId),
          updatedAt: Date.now(),
        });
        this.roomService.getStageState(roomId);
        // 방 참여 이벤트 발생
        this.server
          .to(roomId)
          .emit(
            'join-room',
            Array.from(this.roomService.getParticipants(roomId).values()),
          );
        const bound = this.logger.bind({
          ns: client.nsp?.name,
          event: 'connection',
          sid: client.id,
          roomId,
          userId: userInfo.userId,
          gateway: 'InvitationGateway',
          handler: 'handleConnection',
        });
        bound.log(
          `User ${userInfo.username} (${userInfo.userId}) joined room ${roomId}`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection handling failed: ${errorMessage}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const { userInfo, roomId } = getWsCtx(client);
    const bound = this.logger.bind({
      ns: client.nsp?.name,
      event: 'disconnect',
      sid: client.id,
      roomId,
      userId: userInfo?.userId,
      gateway: 'InvitationGateway',
      handler: 'handleDisconnect',
    });
    bound.log(`Client disconnected: ${client.id}`);
    if (userInfo.userId && roomId) {
      this.roomService.removeParticipant(roomId, userInfo.userId);
      this.server
        .to(roomId)
        .emit(
          'leave-room',
          Array.from(this.roomService.getParticipants(roomId).values()),
        );
    }
  }

  @SubscribeMessage('ready-state')
  onReadyState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { isReady: boolean },
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.room.handleReadyState(client, payload, roomId, userInfo);
  }

  // ===== Event routing to domain handlers =====
  @SubscribeMessage('chat-message')
  onChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatSendRequestDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.chat.handleChatMessage(client, payload, roomId, userInfo);
  }

  // 만날 장소
  @SubscribeMessage('add-location-candidate')
  onAddLocationCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationCandidateDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.location.handleAddLocationCandidate(
      client,
      payload,
      roomId,
      userInfo,
    );
  }
  @SubscribeMessage('remove-location')
  onRemoveLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CandidateIdDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.location.handleRemoveLocationCandidate(
      client,
      payload,
      roomId,
      userInfo,
    );
  }

  // todo:edit-location-candidate-name

  @SubscribeMessage('vote-location')
  onVoteLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CandidateIdDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.location.handleVoteLocation(client, payload, roomId, userInfo);
  }

  // 메뉴 제외
  @SubscribeMessage('exclude-menu')
  onExcludeMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ExcludeMenuDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.excludeMenu.handleExcludeMenu(
      client,
      payload,
      roomId,
      userInfo,
    );
  }

  // 메뉴 선택
  @SubscribeMessage('pick-menu')
  onPickMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MenuActionDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.menu.handlePickMenu(client, payload, roomId, userInfo);
  }

  // 음식점 선택
  @SubscribeMessage('pick-restaurant')
  onPickRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RestaurantActionDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.restaurant.handlePickRestaurant(
      client,
      payload,
      roomId,
      userInfo,
    );
  }

  // @SubscribeMessage('sort-restaurants')
  // onSortRestaurants(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() payload: { sortBy: string },
  //   @WsRoom() roomId: string,
  // ) {
  //   return this.restaurant.handleSortRestaurants(client, payload, roomId);
  // }

  // @SubscribeMessage('filter-restaurants')
  // onFilterRestaurants(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() payload: { categories: string[]; priceLevels: string[] },
  //   @WsRoom() roomId: string,
  // ) {
  //   return this.restaurant.handleFilterRestaurants(client, payload, roomId);
  // }
}
