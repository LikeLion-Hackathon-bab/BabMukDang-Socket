import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { verifyToken, getWsCtx } from './utils';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService } from 'src/domain/room';
import { ChatHandlers } from 'src/domain/chat';
import { LocationHandlers } from 'src/domain/location';
import { MenuHandlers } from 'src/domain/menu';
import { RestaurantHandlers } from 'src/domain/restaurant';
import { ExcludeMenuHandlers } from 'src/domain/exclude-menu';
import { RoomHandlers } from 'src/domain/room';
import { WsRoom, WsUser } from 'src/domain/common/websoket.decorator';
import type { UserInfo } from 'src/domain/common/types';
import type { ChatSendRequestDto } from 'src/domain/chat/dto';
import { MenuActionDto } from 'src/domain/menu/dto';
import { ExcludeMenuDto } from 'src/domain/exclude-menu/dto';
import { RestaurantActionDto } from 'src/domain/restaurant/dto';
import { LocationCandidateDto, CandidateIdDto } from 'src/domain/location/dto';

/**
 * 공통 WebSocket Gateway 추상 클래스
 * Announcement와 Invitation 게이트웨이의 중복 코드를 추출
 */
export abstract class BaseGateway
  implements
    OnGatewayInit,
    OnGatewayConnection<Socket>,
    OnGatewayDisconnect<Socket>
{
  @WebSocketServer()
  server: Server;

  protected abstract readonly namespace: 'announcement' | 'invitation';
  protected abstract readonly roomService: RoomStoreService;
  protected abstract readonly jwtService: JwtService;
  protected abstract readonly logger: WsLogger;
  protected abstract readonly chat: ChatHandlers;
  protected abstract readonly location: LocationHandlers;
  protected abstract readonly menu: MenuHandlers;
  protected abstract readonly restaurant: RestaurantHandlers;
  protected abstract readonly excludeMenu: ExcludeMenuHandlers;
  protected abstract readonly room: RoomHandlers;

  /**
   * 서브클래스에서 구현: 자동 진행 핸들러 등록
   */
  protected abstract registerAutoProgress(server: Server): void;

  afterInit(server: Server) {
    this.server = server;
    // 서브클래스의 자동 진행 핸들러 등록
    this.registerAutoProgress(server);
    this.room.handleInitialStateResponse(this.server);
    this.room.handleFinalStateResponse(this.server);

    // 도메인 핸들러에 서버 참조 전달
    this.location.server = this.server;
    this.menu.server = this.server;
    this.restaurant.server = this.server;
    this.excludeMenu.server = this.server;

    // 공통 미들웨어 등록
    server.use((socket: Socket, next) => {
      try {
        // 1) 토큰 검증
        const auth = socket.handshake.auth as Record<string, unknown>;
        const token = typeof auth?.token === 'string' ? auth.token : undefined;

        if (!token) return next(new Error('Unauthorized: token missing'));

        const userInfo = verifyToken(token, this.jwtService);

        // 2) roomId 확보 (없으면 참여 중인 방을 자동 탐색)
        let rawRoomId = socket.handshake.query.roomId as string | undefined;

        // 3) socket.data에 저장
        const data = socket.data as {
          userId?: string;
          username?: string;
          roomId?: string;
        };
        data.userId = userInfo.sub;
        data.username = userInfo.username;

        // roomId가 비어있으면 현재 유저가 참여자로 등록된 방을 검색
        if (!rawRoomId) {
          const allRooms = this.roomService.getAllRooms();
          for (const [rid] of allRooms.entries()) {
            if (!rid.startsWith(`${this.namespace}:`)) continue;
            if (this.roomService.canJoin(rid, data.userId)) {
              rawRoomId = rid.split(':')[1];
              break;
            }
          }
        }
        if (!rawRoomId) return next(new Error('No room found for this user'));
        const roomId = `${this.namespace}:${rawRoomId}`;

        // 4) 방 참여 검증
        const ok = this.roomService.canJoin(roomId, data.userId);
        if (!ok) return next(new Error('Forbidden: not a room member'));

        data.roomId = roomId;

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

  handleConnection(client: Socket) {
    try {
      const { userInfo, roomId } = getWsCtx(client);
      if (userInfo && userInfo.userId && roomId) {
        // 채팅 메시지 전송
        const chatMessages = this.roomService.getChatMessages(roomId);
        client.emit('chat-messages', chatMessages);
        client.emit('stage-changed', {
          stage: this.roomService.getStage(roomId),
          updatedAt: Date.now(),
        });

        // 서브클래스에서 추가 초기 상태 전송
        this.emitInitialState(client, roomId);

        // 방 정보 알림
        client.emit('room-assigned', { roomId: roomId.split(':')[1] });
        client.emit(
          'final-state-response',
          this.roomService.getFinalState(roomId),
        );

        // 스테이지 상태 호출
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
          gateway: this.constructor.name,
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

  /**
   * 서브클래스에서 구현: 초기 상태 emit (announcement/invitation 차이)
   */
  protected abstract emitInitialState(client: Socket, roomId: string): void;

  handleDisconnect(client: Socket) {
    const { userInfo, roomId } = getWsCtx(client);
    const bound = this.logger.bind({
      ns: client.nsp?.name,
      event: 'disconnect',
      sid: client.id,
      roomId,
      userId: userInfo?.userId,
      gateway: this.constructor.name,
      handler: 'handleDisconnect',
    });
    bound.log(`Client disconnected: ${client.id}`);
    if (userInfo.userId && roomId) {
      this.server
        .to(roomId)
        .emit(
          'leave-room',
          Array.from(this.roomService.getParticipants(roomId).values()),
        );
    }
  }

  // ===== 공통 이벤트 핸들러 =====
  @SubscribeMessage('ready-state')
  onReadyState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { isReady: boolean },
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.room.handleReadyState(client, payload, roomId, userInfo);
  }

  @SubscribeMessage('chat-message')
  onChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatSendRequestDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.chat.handleChatMessage(client, payload, roomId, userInfo);
  }

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

  @SubscribeMessage('vote-location')
  onVoteLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CandidateIdDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.location.handleVoteLocation(client, payload, roomId, userInfo);
  }

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

  @SubscribeMessage('pick-menu')
  onPickMenu(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MenuActionDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    return this.menu.handlePickMenu(client, payload, roomId, userInfo);
  }

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
}
