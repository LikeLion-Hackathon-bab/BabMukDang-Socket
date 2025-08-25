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
    eventEmitter.on(
      'request-final-state',
      ({
        roomId,
        stage,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
      }) => {
        if (stage !== 'restaurant') return;
        const finalRestaurant = this.calculateFinalRestaurant(roomId);
        const finalState = this.roomStore.getFinalState(roomId);
        if (!finalState) return;
        finalState.restaurant = finalRestaurant;
        eventEmitter.emit('final-state-response', {
          roomId,
          finalState,
        });
      },
    );
    eventEmitter.on('request-initial-state', async ({ roomId, stage }) => {
      if (stage !== 'restaurant') return;
      eventEmitter.emit('initial-state-response', {
        roomId,
        stage: 'restaurant',
        initialState: {
          ...(await this.getStepState(roomId)),
          restaurantUserList: this.getRestaurantUserListSerialized(roomId),
        },
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
      room.restaurant = await this.createInitialState(roomId);
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
    room.restaurant = await this.createInitialState(roomId);
    return room.restaurant;
  }
  async resetStep(roomId: string): Promise<void> {
    const room = this.roomStore.getRoom(roomId);
    if (room && room.restaurant) {
      room.restaurant = await this.createInitialState(roomId);
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

  private async createInitialState(roomId: string): Promise<RestaurantStore> {
    let menuLabel = this.roomStore.getRoom(roomId)?.final?.menu?.label;
    if (!menuLabel) {
      this.logger.error('Menu label not found', roomId);
      menuLabel = '';
    }
    const latitude = this.roomStore.getRoom(roomId)?.final?.location?.lat;
    const longitude = this.roomStore.getRoom(roomId)?.final?.location?.lng;
    const initialRestaurants: Restaurant[] = await this.searchRestaurant(
      menuLabel,
      latitude,
      longitude,
    ).then((res) => res.documents);
    return {
      initialRestaurants,
      restaurantUserList: new Map(),
    };
  }

  private async searchRestaurant(
    menuLabel: string,
    latitude?: number,
    longitude?: number,
    address?: string,
  ): Promise<any> {
    const url = `https://dapi.kakao.com/v2/local/search/keyword`;
    const headers = {
      Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}`,
    };
    const query: any = {
      query: menuLabel,
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

    state.restaurantUserList.set(userId, restaurantId);

    this.logger.log(
      `User ${userId} picked restaurant ${restaurantId} in room ${roomId}`,
    );
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
      (restaurant) => restaurant.id === restaurantId,
    );
  }

  /**
   * 사용자의 선택을 가져옵니다
   */
  getUserPicks(roomId: string, userId: string): string[] {
    const state = this.getStepStateSync(roomId);
    if (!state) return [];

    const picks = state.restaurantUserList.get(userId);
    return picks ? Array.from(picks) : [];
  }

  /**
   * 모든 사용자의 선택을 가져옵니다
   */
  getAllUserPicks(roomId: string): Map<string, string> {
    const state = this.getStepStateSync(roomId);
    if (!state) return new Map();
    return state.restaurantUserList;
  }

  getRestaurantUserListSerialized(roomId: string): {
    restaurantId: string;
    userId: string;
  }[] {
    const state = this.getStepStateSync(roomId);
    if (!state) return [];
    const restaurantUserList = state.restaurantUserList;
    const serializedRestaurantUserList = Array.from(
      restaurantUserList.entries(),
    ).map(([userId, restaurantId]) => ({
      userId,
      restaurantId,
    }));
    return serializedRestaurantUserList;
  }

  calculateFinalRestaurant(roomId: string): Restaurant | undefined {
    const state = this.getStepStateSync(roomId);
    if (!state) return undefined;
    const room = this.roomStore.getRoom(roomId);
    if (!room) return undefined;

    const votes = new Map<string, number>();
    state.restaurantUserList.forEach((restaurantId, userId) => {
      votes.set(restaurantId, (votes.get(restaurantId) || 0) + 1);
    });
    const maxVotesRestaurantId = Array.from(votes.entries()).reduce(
      (max, [restaurantId, votes]) =>
        votes > max[1] ? [restaurantId, votes] : max,
      ['', 0],
    )[0];

    const finalRestaurant = this.getRestaurant(roomId, maxVotesRestaurantId);
    return finalRestaurant;
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
      const picks = state.restaurantUserList.get(userId);
      if (!picks) {
        return false;
      }
    }

    return true;
  }
}
