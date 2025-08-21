import { Id } from 'src/domain/common/types';
import { Participant } from 'src/domain/room/dto';
import { ChatMessage } from 'src/domain/chat/types/chat.type';
import { MenuStore } from 'src/domain/menu/types/menu.type';
import { ExcludeMenuStore } from 'src/domain/exclude-menu/types/exclude-menu.types';
import { LocationStore } from 'src/domain/location/types/location.type';
import { RestaurantStore } from 'src/domain/restaurant/types/restaurant.type';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';

export interface RoomStore {
  roomId: Id;
  version: number;
  updatedAt: number;
  stage: AnnouncementStage | InvitationStage;
  participants: Map<Id, ExtendedParticipant>;
  chat: ChatMessage[];
  location?: LocationStore;
  restaurant?: RestaurantStore;
  menu?: MenuStore;
  excludeMenu?: ExcludeMenuStore;
}

export interface ExtendedParticipant extends Participant {
  ready: boolean;
}
