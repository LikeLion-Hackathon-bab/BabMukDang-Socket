import {
  WebSocketGateway,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService, RoomHandlers } from 'src/domain/room';
import { ChatHandlers } from 'src/domain/chat';
import { LocationHandlers } from 'src/domain/location';
import { MenuHandlers } from 'src/domain/menu';
import { RestaurantHandlers } from 'src/domain/restaurant';
import { ExcludeMenuHandlers } from 'src/domain/exclude-menu';
import { DateHandlers } from 'src/domain/date';
import { TimeHandlers } from 'src/domain/time';
import { INVITATION_ROOM_STORE } from './invitation.handlers';
import { BaseGateway } from './base.gateway';
import { WsRoom, WsUser } from 'src/domain/common/websoket.decorator';
import type { UserInfo } from 'src/domain/common/types';

@WebSocketGateway({
  namespace: '/invitation',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class InvitationGateway extends BaseGateway {
  protected readonly namespace = 'invitation' as const;

  constructor(
    @Inject(INVITATION_ROOM_STORE)
    protected readonly roomService: RoomStoreService,
    protected readonly jwtService: JwtService,
    protected readonly logger: WsLogger,
    protected readonly chat: ChatHandlers,
    protected readonly location: LocationHandlers,
    protected readonly menu: MenuHandlers,
    protected readonly restaurant: RestaurantHandlers,
    protected readonly excludeMenu: ExcludeMenuHandlers,
    protected readonly room: RoomHandlers,
    private readonly date: DateHandlers,
    private readonly time: TimeHandlers,
  ) {
    super();
    this.roomService.isInvitation = true;
  }

  protected registerAutoProgress(server: Server): void {
    this.room.handleAutoProgressInvitation(server);
    // Date와 Time 핸들러에 서버 참조 전달
    this.date.server = server;
    this.time.server = server;
  }

  protected emitInitialState(client: Socket, roomId: string): void {
    client.emit('initial-state-response', {
      participants: Array.from(
        this.roomService.getParticipants(roomId).values(),
      ),
    });
  }

  // ===== Invitation 전용 이벤트 핸들러 =====
  @SubscribeMessage('pick-dates')
  onPickDates(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { dates: string[] },
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    this.date.handlePickDates(client, payload, roomId, userInfo);
  }

  @SubscribeMessage('pick-times')
  onPickTimes(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { times: string[] },
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    this.time.handlePickTimes(client, payload, roomId, userInfo);
  }
}
