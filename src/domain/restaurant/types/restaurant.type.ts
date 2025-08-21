import { Id } from 'src/domain/common/types';

export interface RestaurantStore {
  anchorCandidateId: Id; // Step2 선택 결과
  initialRestaurants: Restaurant[];
  pickedByUser: Map<Id, Set<Id>>; // userId -> Set<restaurantId>
  // sortBy: 'DIST' | 'POPULAR' | 'RATING' | 'PRICE' | 'OPEN_NOW';
  // filters?: { categories?: string[]; priceLevels?: number[] };
  finalRestaurant?: Id; // 최종 선택된 레스토랑 ID
  votingDeadline?: number; // 투표 마감 시간 (timestamp)
}

export interface Restaurant {
  restaurantId: Id;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  lat: number;
  lng: number;
}
