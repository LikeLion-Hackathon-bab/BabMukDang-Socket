import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from '../../common/base.service';
import {
  UserMenuCategory,
  ExcludeMenuStore,
  ExclusionCategoryId,
} from '../types/exclude-menu.types';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';
import { RoomStoreService } from 'src/domain/room/services/room.service';

@Injectable()
export class ExcludeMenuService extends BaseService<ExcludeMenuStore> {
  private readonly logger = new Logger(ExcludeMenuService.name);

  constructor(readonly roomStore: RoomStoreService) {
    super(roomStore);
    const emitter = this.roomStore.getEventEmitter();
    emitter.on('request-final-state', ({ roomId, stage }) => {
      if (stage !== 'exclude-menu') return;
      const finalExclusions = this.calculateFinalExclusions(roomId);
      const finalState = this.roomStore.getFinalState(roomId);
      if (!finalState) return;
      finalState.excludeMenu = finalExclusions;
    });
    emitter.on(
      'request-initial-state',
      ({ roomId, stage }: { roomId: string; stage: InvitationStage }) => {
        if (stage !== 'exclude-menu') return;
        this.logger.log(`Initialized exclude-menu state for room ${roomId}`);
        emitter.emit('initial-state-response', {
          roomId,
          stage: 'exclude-menu',
          initialState: this.getStepState(roomId)?.initialUserCategories,
        });
      },
    );
  }

  /**
   * Step 3 상태를 가져옵니다
   */
  getStepState(roomId: string): ExcludeMenuStore | undefined {
    const room = this.roomStore.getRoom(roomId);
    if (!room || room.stage !== 'exclude-menu') return undefined;

    // Step 3 상태가 없으면 초기화
    if (!room.excludeMenu) {
      return this.initializeStep(roomId);
    }
    return room.excludeMenu;
  }

  /**
   * Step 3 상태를 업데이트합니다
   */
  updateStepState(
    roomId: string,
    updateFn: (state: ExcludeMenuStore) => void,
  ): ExcludeMenuStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }

    if (room.stage !== 'exclude-menu') {
      this.throwError('Room is not in Step 3', roomId);
    }

    // Step 3 상태가 없으면 초기화
    if (!room.excludeMenu) {
      room.excludeMenu = this.createInitialState(roomId);
    }

    // 상태 업데이트
    updateFn(room.excludeMenu);

    // 버전 증가
    this.bumpVersion(roomId);

    return room.excludeMenu;
  }

  /**
   * 단계 전환을 검증합니다
   */
  validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean {
    if (fromStage !== 'exclude-menu') return false;
    if (toStage !== 'menu') return false;

    // 상태 검증
    const state = this.getStepState(roomId);
    if (!state) return false;

    // 모든 참여자가 제외 설정을 완료했는지 확인
    const participants = this.getParticipants(roomId);
    if (!participants) return false;

    for (const [userId] of participants) {
      if (!state.userExclusions.has(userId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Step 3 상태를 초기화합니다
   */
  initializeStep(roomId: string): ExcludeMenuStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }

    const initialState = this.createInitialState(roomId);
    room.excludeMenu = initialState;

    this.logger.log(`Initialized exclude-menu state for room ${roomId}`);
    return initialState;
  }

  /**
   * Step 3 상태를 리셋합니다
   */
  resetStep(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    if (room && room.excludeMenu) {
      room.excludeMenu = this.createInitialState(roomId);
      this.bumpVersion(roomId);
      this.logger.log(`Reset exclude-menu state for room ${roomId}`);
    }
  }

  /**
   * Step 3 상태가 유효한지 검증합니다
   */
  validateStepState(roomId: string): boolean {
    const state = this.getStepState(roomId);
    if (!state) return false;

    // 기본 유효성 검사
    if (state.maxExclusionsPerUser < 0) return false;

    // 사용자별 제외 수가 최대 제한을 초과하지 않는지 확인
    for (const [userId, exclusions] of state.userExclusions.entries()) {
      if (exclusions.size > state.maxExclusionsPerUser) {
        return false;
      }
    }

    return true;
  }

  /**
   * Step 3 비즈니스 로직을 검증합니다
   */
  validateBusinessRules(roomId: string, action: string, payload: any): boolean {
    switch (action) {
      case 'SET_USER_EXCLUSIONS':
        return true;
      // this.validateSetUserExclusions(roomId, payload);
      case 'UPDATE_EXCLUSION_CATEGORIES':
        return this.validateUpdateExclusionCategories(payload);
      default:
        return false;
    }
  }

  /**
   * 사용자 제외 설정을 검증합니다
   */
  // private validateSetUserExclusions(
  //   roomId: string,
  //   payload: { userId: string; exclusions: string[] },
  // ): boolean {
  //   if (!payload.userId || typeof payload.userId !== 'string') return false;
  //   if (!Array.isArray(payload.exclusions)) return false;

  //   // 사용자가 방에 있는지 확인
  //   if (!this.isUserInRoom(roomId, payload.userId)) return false;

  //   // 제외 카테고리가 유효한지 확인
  //   const state = this.getStepState(roomId);
  //   if (!state) return false;

  //   for (const category of payload.exclusions) {
  //     if (typeof category !== 'string') return false;
  //     if (!state.exclusionCategories.includes(category)) return false;
  //   }

  //   // 최대 제외 수 확인
  //   if (payload.exclusions.length > state.maxExclusionsPerUser) return false;

  //   return true;
  // }

  /**
   * 제외 카테고리 업데이트를 검증합니다
   */
  private validateUpdateExclusionCategories(payload: any): boolean {
    if (!Array.isArray(payload.categories)) return false;
    if (payload.categories.length === 0) return false;

    for (const category of payload.categories) {
      if (typeof category !== 'string' || category.trim() === '') {
        return false;
      }
    }

    return true;
  }

  /**
   * 초기 상태를 생성합니다
   */
  private createInitialState(roomId: string): ExcludeMenuStore {
    const participants = this.getParticipants(roomId);
    const initialUserCategories = Array.from(participants).map(([userId]) => ({
      userId,
      categoryIds: ['김밥', '순두부찌개', '김밥', '순두부찌개'],
    }));
    return {
      userExclusions: new Map(),
      initialUserCategories,
      maxExclusionsPerUser: 5,
    };
  }

  /**
   * 사용자의 메뉴 제외 설정을 추가합니다
   */
  addUserExclusions(
    roomId: string,
    userId: string,
    itemId: ExclusionCategoryId,
  ): boolean {
    // TODO: 제외 카테고리 검증 로직 추가
    // if (
    //   !this.validateSetUserExclusions(roomId, {
    //     userId,
    //     exclusions,
    //   })
    // ) {
    //   return false;
    // }
    const userExclusionsSet = this.getUserExclusions(roomId, userId);

    if (userExclusionsSet.has(itemId)) {
      userExclusionsSet.delete(itemId);
    } else {
      userExclusionsSet.add(itemId);
    }

    this.logger.log(
      `Added exclusion for user ${userId} in room ${roomId}: ${itemId}`,
    );
    return true;
  }

  /**
   * 사용자의 메뉴 제외 설정을 제거합니다
   */
  removeUserExclusions(
    roomId: string,
    userId: string,
    exclusion: ExclusionCategoryId,
  ): boolean {
    const userExclusionsSet = this.getUserExclusions(roomId, userId);
    userExclusionsSet.delete(exclusion);

    this.logger.log(
      `Removed exclusion for user ${userId} in room ${roomId}: ${exclusion}`,
    );
    return true;
  }
  /**
   * 사용자의 메뉴 제외 설정을 가져옵니다
   */
  getUserExclusions(roomId: string, userId: string): Set<ExclusionCategoryId> {
    const state = this.getStepState(roomId);
    if (!state) return new Set();

    let exclusions = state.userExclusions.get(userId);
    if (!exclusions) {
      exclusions = state.userExclusions.set(userId, new Set()).get(userId)!;
    }
    return exclusions;
  }

  getAllUserExclusions(roomId: string): Map<string, Set<ExclusionCategoryId>> {
    const state = this.getStepState(roomId);
    if (!state) return new Map();

    return state.userExclusions;
  }

  getAllUserExclusionsSerialized(roomId: string): {
    userId: string;
    exclusions: ExclusionCategoryId[];
  }[] {
    const state = this.getStepState(roomId);
    if (!state) return [];
    const userExclusions = state.userExclusions;
    const serializedUserExclusions = Array.from(userExclusions.entries()).map(
      ([userId, exclusions]) => ({
        userId,
        exclusions: Array.from(exclusions),
      }),
    );
    return serializedUserExclusions;
  }

  /**
   * 사용 가능한 메뉴 카테고리를 가져옵니다
   */
  getExclusionCategories(roomId: string): UserMenuCategory[] {
    const state = this.getStepState(roomId);
    if (!state) return [];

    return [...state.initialUserCategories];
  }

  /**
   * 제외 카테고리를 추가합니다
   */
  // addExclusionCategory(roomId: string, category: UserMenuCategory): boolean {
  //   if (!category) {
  //     return false;
  //   }

  //   this.updateStepState(roomId, (state) => {
  //     if (!state.availableCategories.includes(category)) {
  //       state.availableCategories.push(category);
  //     }
  //   });

  //   this.logger.log(
  //     `Added exclusion category: ${category.name} in room ${roomId}`,
  //   );
  //   return true;
  // }

  /**
   * 제외 카테고리를 제거합니다
   */
  // removeExclusionCategory(roomId: string, category: UserMenuCategory): boolean {
  //   this.updateStepState(roomId, (state) => {
  //     const index = state.availableCategories.indexOf(category);
  //     if (index > -1) {
  //       state.availableCategories.splice(index, 1);

  //       // 사용자 제외 설정에서도 제거
  //       for (const [userId, exclusions] of state.userExclusions.entries()) {
  //         exclusions.delete(category);
  //       }

  //       // 최종 제외에서도 제거
  //       state.finalExclusions.delete(category);

  //       // 최종 제외 재계산
  //       this.recalculateFinalExclusions(state);
  //     }
  //   });

  //   this.logger.log(
  //     `Removed exclusion category: ${category} in room ${roomId}`,
  //   );
  //   return true;
  // }

  calculateFinalExclusions(roomId: string): ExclusionCategoryId[] {
    const state = this.getStepState(roomId);
    if (!state) return [];
    const participants = this.getParticipants(roomId);
    if (!participants) return [];
    const finalExclusions = new Set<ExclusionCategoryId>();
    for (const [userId] of participants) {
      const userExclusions = state.userExclusions.get(userId);
      if (!userExclusions) continue;
      for (const exclusion of userExclusions) {
        finalExclusions.add(exclusion);
      }
    }
    return Array.from(finalExclusions);
  }

  /**
   * 최대 제외 수를 설정합니다
   */
  setMaxExclusionsPerUser(roomId: string, maxCount: number): boolean {
    if (maxCount < 0 || maxCount > 10) return false;

    this.updateStepState(roomId, (state) => {
      state.maxExclusionsPerUser = maxCount;
    });

    this.logger.log(
      `Set max exclusions per user to ${maxCount} in room ${roomId}`,
    );
    return true;
  }
}
