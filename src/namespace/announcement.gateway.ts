import { WebSocketGateway } from '@nestjs/websockets';
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
import { ANNOUNCEMENT_ROOM_STORE } from './announcement.handlers';
import { BaseGateway } from './base.gateway';

@WebSocketGateway({
  namespace: '/announcement',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class AnnouncementGateway extends BaseGateway {
  protected readonly namespace = 'announcement' as const;

  constructor(
    @Inject(ANNOUNCEMENT_ROOM_STORE)
    protected readonly roomService: RoomStoreService,
    protected readonly jwtService: JwtService,
    protected readonly logger: WsLogger,
    protected readonly chat: ChatHandlers,
    protected readonly location: LocationHandlers,
    protected readonly menu: MenuHandlers,
    protected readonly restaurant: RestaurantHandlers,
    protected readonly excludeMenu: ExcludeMenuHandlers,
    protected readonly room: RoomHandlers,
  ) {
    super();
    this.roomService.isInvitation = false;
  }

  protected registerAutoProgress(server: Server): void {
    this.room.handleAutoProgressAnnouncement(server);
  }

  protected emitInitialState(client: Socket, roomId: string): void {
    client.emit('initial-state-response', {
      participants: Array.from(
        this.roomService.getParticipants(roomId).values(),
      ),
      locationInitial: this.roomService.getRoom(roomId)?.locationInitial,
      meetingAt: this.roomService.getRoom(roomId)?.meetingAt,
    });
  }
}
