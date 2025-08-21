import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/domain/common/base.service';
import { Restaurant, RestaurantStore } from '../types/restaurant.type';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { AnnouncementStage } from 'src/domain/common/types/stage';
import { InvitationStage } from 'src/domain/common/types/stage';

@Injectable()
export class RestaurantService extends BaseService<RestaurantStore> {
  private readonly logger = new Logger(RestaurantService.name);
  constructor(readonly roomStore: RoomStoreService) {
    super(roomStore);
    const eventEmitter = this.roomStore.getEventEmitter();
    eventEmitter.on('request-initial-state', async ({ roomId, stage }) => {
      if (stage !== 'restaurant') return;
      eventEmitter.emit('initial-state-response', {
        roomId,
        stage: 'restaurant',
        initialState: await this.getStepState(roomId),
      });
    });
  }
  async getStepState(roomId: string): Promise<RestaurantStore | undefined> {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }
    if (!room.restaurant) {
      await this.initializeStep(roomId);
    }
    return room.restaurant;
  }
  getStepStateSync(roomId: string): RestaurantStore | undefined {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }
    return room.restaurant;
  }
  async updateStepState(
    roomId: string,
    updateFn: (state: RestaurantStore) => void,
  ): Promise<RestaurantStore> {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }
    if (room.stage !== 'restaurant') {
      this.throwError('Room is not in restaurant stage', roomId);
    }
    if (!room.restaurant) {
      room.restaurant = await this.createInitialState();
    }
    updateFn(room.restaurant);
    this.roomStore.bump(room);
    return room.restaurant;
  }
  async initializeStep(roomId: string): Promise<RestaurantStore> {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }
    room.restaurant = await this.createInitialState();
    return room.restaurant;
  }
  async resetStep(roomId: string): Promise<void> {
    const room = this.roomStore.getRoom(roomId);
    if (room && room.restaurant) {
      room.restaurant = await this.createInitialState();
      this.roomStore.bump(room);
      this.logger.log(`Reset restaurant state for room ${roomId}`);
    }
  }
  validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean {
    if (fromStage !== 'restaurant') return false;
    return true;
  }
  validateStepState(roomId: string): boolean {
    const room = this.roomStore.getRoom(roomId);
    if (!room || room.stage !== 'restaurant') return false;
    return true;
  }
  validateBusinessRules(roomId: string, action: string, payload: any): boolean {
    return true;
  }

  private async createInitialState(): Promise<RestaurantStore> {
    const initialRestaurants: Restaurant[] = await this.searchRestaurant(
      ['김밥'],
      37.4806,
      126.8521,
    ).then((res) => res.documents);
    return {
      initialRestaurants,
      anchorCandidateId: '',
      pickedByUser: new Map(),
      // sortBy: 'DIST',
      // filters: {
      //   categories: [],
      //   priceLevels: [],
      // },
    };
  }

  private async searchRestaurant(
    categories: string[],
    latitude?: number,
    longitude?: number,
    address?: string,
  ): Promise<any> {
    const url = `https://dapi.kakao.com/v2/local/search/keyword`;
    const headers = {
      Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}`,
    };
    const query: any = {
      query: categories.join(','),
      category_group_code: 'FD6',
      radius: 10000,
      sort: 'accuracy',
    };
    if (latitude && longitude) {
      query.x = longitude;
      query.y = latitude;
    }
    if (address) {
      query.address = address;
    }
    try {
      const response = await fetch(
        `${url}?${new URLSearchParams(Object.entries(query))}`,
        {
          method: 'GET',
          headers,
        },
      ).then((res) => res.json());
      return response;
    } catch (error) {
      console.error(error);
    }
    //  "Authorization", "KakaoAK " + REST_KEY
    // https://developers.kakao.com/docs/latest/ko/local/dev-guide#coord-to-address
    //https://developers.naver.com/docs/serviceapi/search/local/local.md#%EC%A7%80%EC%97%AD-%EA%B2%80%EC%83%89-%EA%B2%B0%EA%B3%BC-%EC%A1%B0%ED%9A%8C
  }

  /**
   * 레스토랑을 선택/해제합니다
   */
  pickRestaurant(
    roomId: string,
    userId: string,
    restaurantId: string,
  ): boolean {
    // if (
    //   !this.validatePickRestaurant(roomId, { restaurantId, userId, isPicking })
    // ) {
    //   return false;
    // }
    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    let userPicks = state.pickedByUser.get(userId);
    if (!userPicks) {
      userPicks = new Set();
      state.pickedByUser.set(userId, userPicks);
    }

    if (userPicks.has(restaurantId)) {
      userPicks.delete(restaurantId);
    } else {
      userPicks.add(restaurantId);
    }

    this.logger.log(
      `User ${userId} ${
        userPicks.has(restaurantId) ? 'picked' : 'unpicked'
      } restaurant ${restaurantId} in room ${roomId}`,
    );
    return true;
  }

  /**
   * 최종 레스토랑을 설정합니다
   */
  setFinalRestaurant(roomId: string, restaurantId: string): boolean {
    // if (!this.validateSetFinalRestaurant(roomId, { restaurantId })) {
    //   return false;
    // }

    this.updateStepState(roomId, (state) => {
      state.finalRestaurant = restaurantId;
    });

    this.logger.log(
      `Set final restaurant to ${restaurantId} in room ${roomId}`,
    );
    return true;
  }

  /**
   * 최종 레스토랑 선택을 해제합니다
   */
  unsetFinalRestaurant(roomId: string): boolean {
    this.updateStepState(roomId, (state) => {
      state.finalRestaurant = undefined;
    });

    this.logger.log(`Unset final restaurant in room ${roomId}`);
    return true;
  }

  // /**
  //  * 정렬 기준을 설정합니다
  //  */
  // setSortBy(
  //   roomId: string,
  //   sortBy: 'DIST' | 'POPULAR' | 'RATING' | 'PRICE' | 'OPEN_NOW',
  // ): boolean {
  //   if (!this.validateSetSortBy({ sortBy })) return false;

  //   this.updateStepState(roomId, (state) => {
  //     state.sortBy = sortBy;
  //     state.lastActivity = Date.now();
  //   });

  //   this.logger.log(`Set sort by to ${sortBy} in room ${roomId}`);
  //   return true;
  // }

  // /**
  //  * 필터를 설정합니다
  //  */
  // setFilters(
  //   roomId: string,
  //   filters: { categories?: string[]; priceLevels?: number[] },
  // ): boolean {
  //   if (
  //     !this.validateSetFilters({
  //       categories: filters.categories,
  //       priceLevels: filters.priceLevels,
  //     })
  //   ) {
  //     return false;
  //   }

  //   this.updateStepState(roomId, (state) => {
  //     state.filters = filters;
  //     state.lastActivity = Date.now();
  //   });

  //   this.logger.log(`Set filters in room ${roomId}`);
  //   return true;
  // }

  // /**
  //  * 투표 마감 시간을 설정합니다
  //  */
  // setVotingDeadline(roomId: string, deadline: number): boolean {
  //   if (deadline <= Date.now()) return false;

  //   this.updateStepState(roomId, (state) => {
  //     state.votingDeadline = deadline;
  //     state.lastActivity = Date.now();
  //   });

  //   this.logger.log(`Set voting deadline to ${deadline} in room ${roomId}`);
  //   return true;
  // }

  /**
   * 레스토랑 목록을 가져옵니다
   */
  getRestaurants(roomId: string): Restaurant[] {
    const state = this.getStepStateSync(roomId);
    return state ? state.initialRestaurants : [];
  }

  /**
   * 특정 레스토랑을 가져옵니다
   */
  getRestaurant(roomId: string, restaurantId: string): Restaurant | undefined {
    const state = this.getStepStateSync(roomId);
    return state?.initialRestaurants.find(
      (restaurant) => restaurant.restaurantId === restaurantId,
    );
  }

  /**
   * 사용자의 선택을 가져옵니다
   */
  getUserPicks(roomId: string, userId: string): string[] {
    const state = this.getStepStateSync(roomId);
    if (!state) return [];

    const picks = state.pickedByUser.get(userId);
    return picks ? Array.from(picks) : [];
  }

  /**
   * 모든 사용자의 선택을 가져옵니다
   */
  getAllUserPicks(roomId: string): Map<string, Set<string>> {
    const state = this.getStepStateSync(roomId);
    if (!state) return new Map();
    return state.pickedByUser;
  }

  getAllUserPicksSerialized(roomId: string): {
    userId: string;
    picks: string[];
  }[] {
    const state = this.getStepStateSync(roomId);
    if (!state) return [];
    const userPicks = state.pickedByUser;
    const serializedUserPicks = Array.from(userPicks.entries()).map(
      ([userId, picks]) => ({
        userId,
        picks: Array.from(picks),
      }),
    );
    return serializedUserPicks;
  }
  /**
   * 레스토랑별 선택 수를 가져옵니다
   */
  getRestaurantPickCounts(roomId: string): Map<string, number> {
    const state = this.getStepStateSync(roomId);
    if (!state) return new Map();

    const pickCounts = new Map<string, number>();

    // 모든 레스토랑을 0으로 초기화
    for (const restaurantId of state.initialRestaurants.map(
      (restaurant) => restaurant.restaurantId,
    )) {
      pickCounts.set(restaurantId, 0);
    }

    // 선택 수 계산
    for (const picks of state.pickedByUser.values()) {
      for (const restaurantId of picks) {
        const currentCount = pickCounts.get(restaurantId) || 0;
        pickCounts.set(restaurantId, currentCount + 1);
      }
    }

    return pickCounts;
  }

  /**
   * 가장 많은 선택을 받은 레스토랑을 가져옵니다
   */
  getMostPickedRestaurant(roomId: string): string | undefined {
    const pickCounts = this.getRestaurantPickCounts(roomId);
    if (pickCounts.size === 0) return undefined;

    let maxPicks = 0;
    let mostPickedId: string | undefined;

    for (const [restaurantId, picks] of pickCounts.entries()) {
      if (picks > maxPicks) {
        maxPicks = picks;
        mostPickedId = restaurantId;
      }
    }

    return mostPickedId;
  }

  /**
   * 최종 선택된 레스토랑을 가져옵니다
   */
  getFinalRestaurant(roomId: string): string | undefined {
    const state = this.getStepStateSync(roomId);
    return state?.finalRestaurant;
  }

  /**
   * 모든 참여자가 선택을 완료했는지 확인합니다
   */
  allUsersCompletedPicking(roomId: string): boolean {
    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    const participants = this.getParticipants(roomId);
    if (!participants) return false;

    for (const [userId] of participants) {
      const picks = state.pickedByUser.get(userId);
      if (!picks || picks.size === 0) {
        return false;
      }
    }

    return true;
  }
}
