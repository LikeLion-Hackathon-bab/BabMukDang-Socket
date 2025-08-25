import { Injectable, Inject } from '@nestjs/common';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService } from 'src/domain/room';
import { RoomHandlers } from 'src/domain/room';
import { ChatHandlers } from 'src/domain/chat';
import { RestaurantHandlers } from 'src/domain/restaurant';
import { LocationHandlers } from 'src/domain/location';
import { MenuHandlers } from 'src/domain/menu';
import { ExcludeMenuHandlers } from 'src/domain/exclude-menu';
import { LocationService } from 'src/domain/location';
import { MenuService } from 'src/domain/menu';
import { ExcludeMenuService } from 'src/domain/exclude-menu';
import { RestaurantService } from 'src/domain/restaurant';
import { ServerService } from 'src/domain/room';

export const ANNOUNCEMENT_ROOM_STORE = 'ANNOUNCEMENT_ROOM_STORE';

@Injectable()
export class AnnouncementRoomHandlers extends RoomHandlers {
  constructor(
    logger: WsLogger,
    @Inject(ANNOUNCEMENT_ROOM_STORE) roomService: RoomStoreService,
    private readonly serverService: ServerService,
  ) {
    super(logger, roomService, serverService);
  }
}

@Injectable()
export class AnnouncementChatHandlers extends ChatHandlers {
  constructor(
    logger: WsLogger,
    @Inject(ANNOUNCEMENT_ROOM_STORE) roomService: RoomStoreService,
  ) {
    super(logger, roomService);
  }
}

@Injectable()
export class AnnouncementRestaurantHandlers extends RestaurantHandlers {
  constructor(
    logger: WsLogger,
    private readonly restaurantSvc: RestaurantService,
  ) {
    super(logger, restaurantSvc);
  }
}

@Injectable()
export class AnnouncementLocationHandlers extends LocationHandlers {
  constructor(
    logger: WsLogger,
    private readonly locationSvc: LocationService,
  ) {
    super(logger, locationSvc);
  }
}

@Injectable()
export class AnnouncementMenuHandlers extends MenuHandlers {
  constructor(
    logger: WsLogger,
    private readonly menuSvc: MenuService,
  ) {
    super(logger, menuSvc);
  }
}

@Injectable()
export class AnnouncementExcludeMenuHandlers extends ExcludeMenuHandlers {
  constructor(
    logger: WsLogger,
    private readonly excludeMenuSvc: ExcludeMenuService,
  ) {
    super(logger, excludeMenuSvc);
  }
}
