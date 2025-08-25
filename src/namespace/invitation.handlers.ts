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
import { DateHandlers, DateService } from 'src/domain/date';
import { TimeHandlers, TimeService } from 'src/domain/time';
import { ServerService } from 'src/domain/room';

export const INVITATION_ROOM_STORE = 'INVITATION_ROOM_STORE';

@Injectable()
export class InvitationRoomHandlers extends RoomHandlers {
  constructor(
    logger: WsLogger,
    @Inject(INVITATION_ROOM_STORE) roomService: RoomStoreService,
    private readonly serverService: ServerService,
  ) {
    super(logger, roomService, serverService);
  }
}

@Injectable()
export class InvitationChatHandlers extends ChatHandlers {
  constructor(
    logger: WsLogger,
    @Inject(INVITATION_ROOM_STORE) roomService: RoomStoreService,
  ) {
    super(logger, roomService);
  }
}

@Injectable()
export class InvitationRestaurantHandlers extends RestaurantHandlers {
  constructor(
    logger: WsLogger,
    private readonly restaurantSvc: RestaurantService,
  ) {
    super(logger, restaurantSvc);
  }
}

@Injectable()
export class InvitationLocationHandlers extends LocationHandlers {
  constructor(
    logger: WsLogger,
    private readonly locationSvc: LocationService,
  ) {
    super(logger, locationSvc);
  }
}

@Injectable()
export class InvitationMenuHandlers extends MenuHandlers {
  constructor(
    logger: WsLogger,
    private readonly menuSvc: MenuService,
  ) {
    super(logger, menuSvc);
  }
}

@Injectable()
export class InvitationExcludeMenuHandlers extends ExcludeMenuHandlers {
  constructor(
    logger: WsLogger,
    private readonly excludeMenuSvc: ExcludeMenuService,
  ) {
    super(logger, excludeMenuSvc);
  }
}

@Injectable()
export class InvitationDateHandlers extends DateHandlers {
  constructor(
    logger: WsLogger,
    private readonly dateSvc: DateService,
  ) {
    super(logger, dateSvc);
  }
}

@Injectable()
export class InvitationTimeHandlers extends TimeHandlers {
  constructor(
    logger: WsLogger,
    private readonly timeSvc: TimeService,
  ) {
    super(logger, timeSvc);
  }
}
