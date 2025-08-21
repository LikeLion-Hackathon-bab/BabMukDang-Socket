export type AnnouncementStage =
  | 'waiting'
  | 'location'
  | 'location-vote'
  | 'exclude-menu'
  | 'menu'
  | 'restaurant'
  | 'finish';

export type InvitationStage =
  | 'waiting'
  | 'date'
  | 'time'
  | 'location'
  | 'location-vote'
  | 'exclude-menu'
  | 'menu'
  | 'restaurant'
  | 'finish';

export const AnnouncementStageMap: Record<AnnouncementStage, number> = {
  waiting: 1,
  location: 2,
  'location-vote': 3,
  'exclude-menu': 4,
  menu: 5,
  restaurant: 6,
  finish: 7,
};

export const InvitationStageMap: Record<InvitationStage, number> = {
  waiting: 1,
  date: 2,
  time: 3,
  location: 4,
  'location-vote': 5,
  'exclude-menu': 6,
  menu: 7,
  restaurant: 8,
  finish: 9,
};
