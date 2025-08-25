import { Module } from '@nestjs/common';
import { InvitationGateway } from './invitation.gateway';
import { JwtService } from '@nestjs/jwt';
// Removed domain module imports; using namespaced providers instead
import { RoomStoreService, ServerService } from 'src/domain/room';
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
  INVITATION_ROOM_STORE,
  InvitationChatHandlers,
  InvitationExcludeMenuHandlers,
  InvitationRestaurantHandlers,
  InvitationRoomHandlers,
  InvitationLocationHandlers,
  InvitationMenuHandlers,
} from './invitation.handlers';
import { RestaurantService } from 'src/domain/restaurant';
import { HttpModule } from '@nestjs/axios';
// import { WsContextInterceptor } from 'src/domain/common/logger/ws-context.interceptor';
@Module({
  providers: [
    JwtService,
    InvitationGateway,
    { provide: INVITATION_ROOM_STORE, useClass: RoomStoreService },
    { provide: RoomHandlers, useClass: InvitationRoomHandlers },
    { provide: ChatHandlers, useClass: InvitationChatHandlers },
    { provide: RestaurantHandlers, useClass: InvitationRestaurantHandlers },
    { provide: LocationHandlers, useClass: InvitationLocationHandlers },
    { provide: MenuHandlers, useClass: InvitationMenuHandlers },
    { provide: ExcludeMenuHandlers, useClass: InvitationExcludeMenuHandlers },
    // namespace-bound domain services
    {
      provide: LocationService,
      useFactory: (store: RoomStoreService) => new LocationService(store),
      inject: [INVITATION_ROOM_STORE],
    },
    {
      provide: MenuService,
      useFactory: (store: RoomStoreService) => new MenuService(store),
      inject: [INVITATION_ROOM_STORE],
    },
    {
      provide: ExcludeMenuService,
      useFactory: (store: RoomStoreService) => new ExcludeMenuService(store),
      inject: [INVITATION_ROOM_STORE],
    },
    {
      provide: RestaurantService,
      useFactory: (store: RoomStoreService) => new RestaurantService(store),
      inject: [INVITATION_ROOM_STORE],
    },
    ServerService,
  ],
  imports: [HttpModule],
  exports: [InvitationGateway, INVITATION_ROOM_STORE],
})
export class InvitationModule {}
