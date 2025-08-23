import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RestaurantActionDto } from '../dto/request.dto';
import { RestaurantService } from '../services/restaurant.service';

@Injectable()
export class RestaurantHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly restaurantService: RestaurantService,
  ) {}
  // ===== 식당 선택 관련 핸들러 =====
  server: Server;

  handlePickRestaurant(
    client: Socket,
    payload: RestaurantActionDto,
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { restaurantId } = payload;

    this.restaurantService.pickRestaurant(
      roomId,
      userInfo.userId,
      restaurantId,
    );

    this.logger.log(
      `User ${userInfo.userId} picked restaurant ${restaurantId} in room ${roomId}`,
    );

    const responseDto =
      this.restaurantService.getRestaurantUserListSerialized(roomId);
    this.server.to(roomId).emit('restaurant-pick-updated', responseDto);
  }

  // handleSortRestaurants(
  //   client: Socket,
  //   payload: { sortBy: string },
  //   roomId: string,
  // ) {
  //   const { sortBy } = payload;

  //   // TODO: Implement sortRestaurants method in RoomStoreService
  //   this.logger.log(`Restaurants sorted by ${sortBy} in room ${roomId}`);

  //   // 다른 참여자들에게 정렬 기준 변경 알림
  //   client.to(roomId).emit('restaurant-sort-changed', {
  //     sortBy,
  //     timestamp: Date.now(),
  //   });

  //   // 성공 응답
  //   client.emit('sort-restaurants-success', {
  //     roomId,
  //     sortBy,
  //     timestamp: Date.now(),
  //   });
  // }

  // handleFilterRestaurants(
  //   client: Socket,
  //   payload: { categories: string[]; priceLevels: string[] },
  //   roomId: string,
  // ) {
  //   const { categories, priceLevels } = payload;

  //   // TODO: Implement filterRestaurants method in RoomStoreService
  //   this.logger.log(
  //     `Restaurants filtered in room ${roomId} ${categories.join(',')} ${priceLevels.join(',')}`,
  //   );

  //   // 다른 참여자들에게 필터 변경 알림
  //   client.to(roomId).emit('restaurant-filters-changed', {
  //     categories,
  //     priceLevels,
  //     timestamp: Date.now(),
  //   });

  //   // 성공 응답
  //   client.emit('filter-restaurants-success', {
  //     roomId,
  //     categories,
  //     priceLevels,
  //     timestamp: Date.now(),
  //   });
  // }
}
