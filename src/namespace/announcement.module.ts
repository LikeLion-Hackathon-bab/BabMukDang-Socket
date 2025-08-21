import { Module } from '@nestjs/common';
import { AnnouncementGateway } from './announcement.gateway';
import { JwtService } from '@nestjs/jwt';
// Removed domain module imports; using namespaced providers instead
import { RoomStoreService } from 'src/domain/room';
import { RoomHandlers } from 'src/domain/room';
import { ChatHandlers } from 'src/domain/chat';
import { RestaurantHandlers } from 'src/domain/restaurant';
import { LocationHandlers } from 'src/domain/location';
import { MenuHandlers } from 'src/domain/menu';
import { LocationService } from 'src/domain/location';
import { MenuService } from 'src/domain/menu';
import { ExcludeMenuService } from 'src/domain/exclude-menu';
import { ExcludeMenuHandlers } from 'src/domain/exclude-menu';
import {
  ANNOUNCEMENT_ROOM_STORE,
  AnnouncementChatHandlers,
  AnnouncementExcludeMenuHandlers,
  AnnouncementRestaurantHandlers,
  AnnouncementRoomHandlers,
  AnnouncementLocationHandlers,
  AnnouncementMenuHandlers,
} from './announcement.handlers';
import { RestaurantService } from 'src/domain/restaurant';
// import { WsContextInterceptor } from 'src/domain/common/logger/ws-context.interceptor';
@Module({
  providers: [
    JwtService,
    AnnouncementGateway,
    // provide namespaced room store
    { provide: ANNOUNCEMENT_ROOM_STORE, useClass: RoomStoreService },
    // override base handler tokens with namespaced versions
    { provide: RoomHandlers, useClass: AnnouncementRoomHandlers },
    { provide: ChatHandlers, useClass: AnnouncementChatHandlers },
    { provide: RestaurantHandlers, useClass: AnnouncementRestaurantHandlers },
    { provide: LocationHandlers, useClass: AnnouncementLocationHandlers },
    { provide: MenuHandlers, useClass: AnnouncementMenuHandlers },
    { provide: ExcludeMenuHandlers, useClass: AnnouncementExcludeMenuHandlers },
    // namespace-bound domain services
    {
      provide: LocationService,
      useFactory: (store: RoomStoreService) => new LocationService(store),
      inject: [ANNOUNCEMENT_ROOM_STORE],
    },
    {
      provide: MenuService,
      useFactory: (store: RoomStoreService) => new MenuService(store),
      inject: [ANNOUNCEMENT_ROOM_STORE],
    },
    {
      provide: ExcludeMenuService,
      useFactory: (store: RoomStoreService) => new ExcludeMenuService(store),
      inject: [ANNOUNCEMENT_ROOM_STORE],
    },
    {
      provide: RestaurantService,
      useFactory: (store: RoomStoreService) => new RestaurantService(store),
      inject: [ANNOUNCEMENT_ROOM_STORE],
    },
  ],
  imports: [],
  exports: [AnnouncementGateway],
})
export class AnnouncementModule {}
