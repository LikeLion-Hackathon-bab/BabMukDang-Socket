import { Id } from 'src/domain/common/types';

export interface RestaurantStore {
  initialRestaurants: Restaurant[];
  restaurantUserList: Map<Id, Id>; // userId -> restaurantId
  // sortBy: 'DIST' | 'POPULAR' | 'RATING' | 'PRICE' | 'OPEN_NOW';
  // filters?: { categories?: string[]; priceLevels?: number[] };
  votingDeadline?: number; // 투표 마감 시간 (timestamp)
}

export interface Restaurant {
  id: Id;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  lat: number;
  lng: number;
}
