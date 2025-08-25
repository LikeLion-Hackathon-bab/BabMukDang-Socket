import { Id } from 'src/domain/common/types';
import { Participant } from 'src/domain/room/dto';
import { ChatMessage } from 'src/domain/chat/types/chat.type';
import { MenuRecommendation, MenuStore } from 'src/domain/menu/types/menu.type';
import { ExcludeMenuStore } from 'src/domain/exclude-menu/types/exclude-menu.types';
import {
  LocationCandidate,
  LocationStore,
} from 'src/domain/location/types/location.type';
import {
  Restaurant,
  RestaurantStore,
} from 'src/domain/restaurant/types/restaurant.type';
import { DateStore } from 'src/domain/date/types/date.type';
import { TimeStore } from 'src/domain/time/types/time.type';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';

export interface FinalState {
  location: LocationCandidate | undefined;
  excludeMenu: MenuRecommendation[] | undefined;
  menu: MenuRecommendation | undefined;
  restaurant: Restaurant | undefined;
  time: string;
  date: string;
}
export interface RoomStore {
  roomId: Id;
  version: number;
  updatedAt: number;
  stage: AnnouncementStage | InvitationStage;
  participants: Map<Id, ExtendedParticipant>; // userId -> ExtendedParticipant
  recentMenu: Map<Id, MenuRecommendation[]>; // userId -> MenuRecommendation[]
  timeout: NodeJS.Timeout | undefined;
  chat: ChatMessage[];
  meetingAt?: string;
  locationInitial?: string;
  date?: DateStore;
  time?: TimeStore;
  location?: LocationStore;
  restaurant?: RestaurantStore;
  menu?: MenuStore;
  excludeMenu?: ExcludeMenuStore;
  final: FinalState;
}

export interface ExtendedParticipant extends Participant {
  userProfileImageURL?: string;
  ready: boolean;
}
