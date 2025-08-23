import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from '../../common/base.service';
import { MenuRecommendation, MenuStore } from '../types/menu.type';
import { InvitationStage } from 'src/domain/common/types/stage';
import { AnnouncementStage } from 'src/domain/common/types/stage';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { MenuRecommendationResponseDto } from '../dto/menu-recommendation.dto';

@Injectable()
export class MenuService extends BaseService<MenuStore> {
  private readonly logger = new Logger(MenuService.name);

  constructor(readonly roomStore: RoomStoreService) {
    super(roomStore);

    const emitter = this.roomStore.getEventEmitter();
    emitter.on(
      'request-final-state',
      ({
        roomId,
        stage,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
      }) => {
        if (stage !== 'menu') return;
        const finalMenu = this.calculateFinalMenu(roomId);
        const finalState = this.roomStore.getFinalState(roomId);
        if (!finalState) return;
        finalState.menu = finalMenu;
      },
    );
    emitter.on(
      'request-initial-state',
      async ({ roomId, stage }: { roomId: string; stage: InvitationStage }) => {
        const state = await this.getStepState(roomId);
        if (stage !== 'menu') return;
        this.logger.log(`Initialized menu state for room ${roomId}`);
        emitter.emit('initial-state-response', {
          roomId,
          stage: 'menu',
          initialState: {
            availableMenus: state?.availableMenus || [],
            menuPerUserSelections: this.getAllUserSelectionsSerialized(roomId),
          },
        });
      },
    );
  }
  /**
   * 상태를 가져옵니다
   */
  async getStepState(roomId: string): Promise<MenuStore | undefined> {
    const room = this.roomStore.getRoom(roomId);
    if (!room || room.stage !== 'menu') return undefined;
    if (!room.menu) {
      room.menu = await this.initializeStep(roomId);
    }

    return room.menu;
  }

  getStepStateSync(roomId: string): MenuStore | undefined {
    const room = this.roomStore.getRoom(roomId);
    if (!room || room.stage !== 'menu') return undefined;

    return room.menu;
  }
  /**
   * 상태를 업데이트합니다
   */
  async updateStepState(
    roomId: string,
    updateFn: (state: MenuStore) => void,
  ): Promise<MenuStore> {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }

    if (room.stage !== 'menu') {
      this.throwError('Room is not in Step 4', roomId);
    }

    // Step 4 상태가 없으면 초기화
    if (!room.menu) {
      room.menu = await this.createInitialState(roomId);
    }

    // 상태 업데이트
    updateFn(room.menu);

    // 버전 증가
    this.bumpVersion(roomId);

    return room.menu;
  }

  /**
   * 단계 전환을 검증합니다
   */
  validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean {
    if (fromStage !== 'menu') return false;
    if (toStage !== 'restaurant') return false;

    // 상태 검증
    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    // 최소 메뉴 수 확인
    if (state.availableMenus.length < 1) {
      return false;
    }

    return true;
  }

  /**
   * 상태를 초기화합니다
   */
  async initializeStep(roomId: string): Promise<MenuStore> {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }

    const initialState = await this.createInitialState(roomId);
    room.menu = initialState;

    this.logger.log(`Initialized menu state for room ${roomId}`);
    return initialState;
  }

  /**
   * 상태를 리셋합니다
   */
  async resetStep(roomId: string): Promise<void> {
    const room = this.roomStore.getRoom(roomId);
    if (room && room.menu) {
      room.menu = await this.createInitialState(roomId);
      this.bumpVersion(roomId);
      this.logger.log(`Reset menu state for room ${roomId}`);
    }
  }

  /**
   * 상태가 유효한지 검증합니다
   */
  validateStepState(roomId: string): boolean {
    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    // 기본 유효성 검사
    if (state.maxMenusPerUser < 1) return false;

    // 사용자별 선택 수가 최대 제한을 초과하지 않는지 확인
    for (const [menuId, selections] of state.menuPerUserSelections.entries()) {
      if (selections.size > state.maxMenusPerUser) {
        return false;
      }
    }

    return true;
  }

  /**
   * 비즈니스 로직을 검증합니다
   */
  validateBusinessRules(roomId: string, action: string, payload: any): boolean {
    switch (action) {
      case 'ADD_MENU':
        return this.validateAddMenu(roomId, payload);
      case 'REMOVE_MENU':
        return this.validateRemoveMenu(roomId, payload);
      case 'SELECT_MENU':
        return this.validateSelectMenu(roomId, payload);
      case 'SET_FINAL_MENU':
        return this.validateSetFinalMenu(roomId, payload);
      default:
        return false;
    }
  }

  /**
   * 메뉴 추가를 검증합니다
   */
  private validateAddMenu(roomId: string, payload: any): boolean {
    if (!payload.name || typeof payload.name !== 'string') return false;
    if (!payload.category || typeof payload.category !== 'string') return false;
    if (payload.price && typeof payload.price !== 'number') return false;
    if (payload.price && payload.price < 0) return false;

    return true;
  }

  /**
   * 메뉴 제거를 검증합니다
   */
  private validateRemoveMenu(roomId: string, payload: any): boolean {
    if (!payload.menuId || typeof payload.menuId !== 'string') return false;

    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    // 메뉴가 존재하는지 확인
    if (!state.availableMenus.some((menu) => menu.code === payload.menuId))
      return false;

    return true;
  }

  /**
   * 메뉴 선택을 검증합니다
   */
  private validateSelectMenu(roomId: string, payload: any): boolean {
    if (!payload.menuId || typeof payload.menuId !== 'string') return false;
    if (!payload.userId || typeof payload.userId !== 'string') return false;

    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    // 메뉴가 존재하는지 확인
    if (!state.availableMenus.some((menu) => menu.code === payload.menuId))
      return false;

    // 사용자가 방에 있는지 확인
    if (!this.isUserInRoom(roomId, payload.userId)) return false;
    return true;
  }

  /**
   * 최종 메뉴 설정을 검증합니다
   */
  private validateSetFinalMenu(roomId: string, payload: any): boolean {
    if (!payload.menuId || typeof payload.menuId !== 'string') return false;

    const state = this.getStepStateSync(roomId);
    if (!state) return false;

    // 메뉴가 존재하는지 확인
    if (!state.availableMenus.some((menu) => menu.code === payload.menuId))
      return false;

    return true;
  }

  /**
   * 초기 상태를 생성합니다
   */
  private async createInitialState(roomId: string): Promise<MenuStore> {
    const menus = await this.getMenuRecommendation(roomId);
    const availableMenus = menus.map((menu) => ({
      code: menu.code,
      label: menu.label,
    }));
    return {
      availableMenus,
      menuPerUserSelections: new Map(),
      maxMenusPerUser: 3,
      selectionDeadline: undefined,
    };
  }

  /**
   * 메뉴를 추가합니다
   */
  // addMenu(roomId: string, menu: MenuOption): boolean {
  //   if (!this.validateAddMenu(roomId, menu)) {
  //     return false;
  //   }

  //   this.updateStepState(roomId, (state) => {
  //     state.availableMenus.add(menu);
  //   });

  //   this.logger.log(
  //     `Added menu ${menu.menuCategoryId} (${menu.menuName}) to room ${roomId}`,
  //   );
  //   return true;
  // }

  /**
   * 메뉴를 제거합니다
   */
  // removeMenu(roomId: string, menuId: string): boolean {
  //   if (!this.validateRemoveMenu(roomId, { menuId })) {
  //     return false;
  //   }

  //   this.updateStepState(roomId, (state) => {
  //     state.availableMenus.delete(menuId);

  //     // 사용자 선택에서도 제거
  //     for (const [userId, selections] of state.userSelections.entries()) {
  //       selections.delete(menuId);
  //       state.userSelections.set(userId, selections);
  //     }

  //     // 최종 선택된 메뉴였다면 선택 해제
  //     if (state.finalSelection === menuId) {
  //       state.finalSelection = undefined;
  //     }
  //   });

  //   this.logger.log(`Removed menu ${menuId} from room ${roomId}`);
  //   return true;
  // }

  /**
   * 메뉴를 선택/해제합니다
   */
  selectMenu(roomId: string, userId: string, menuId: string): boolean {
    // if (!this.validateSelectMenu(roomId, { menuId, userId })) {
    //   return false;
    // }
    const state = this.getStepStateSync(roomId);
    if (!state) return false;
    let userSelections = state.menuPerUserSelections.get(menuId);
    if (!userSelections) {
      userSelections = state.menuPerUserSelections
        .set(menuId, new Set())
        .get(menuId)!;
    }

    if (userSelections.has(userId)) {
      userSelections.delete(userId);
    } else {
      userSelections.add(userId);
    }
    this.logger.log(`User ${userId} selected menu ${menuId} in room ${roomId}`);
    return true;
  }

  /**
   * 선택 마감 시간을 설정합니다
   */
  setSelectionDeadline(roomId: string, deadline: number): boolean {
    if (deadline <= Date.now()) return false;

    this.updateStepState(roomId, (state) => {
      state.selectionDeadline = deadline;
    });

    this.logger.log(`Set selection deadline to ${deadline} in room ${roomId}`);
    return true;
  }

  /**
   * 최대 선택 수를 설정합니다
   */
  setMaxMenusPerUser(roomId: string, maxCount: number): boolean {
    if (maxCount < 1 || maxCount > 10) return false;

    this.updateStepState(roomId, (state) => {
      state.maxMenusPerUser = maxCount;
    });

    this.logger.log(`Set max menus per user to ${maxCount} in room ${roomId}`);
    return true;
  }

  /**
   * 메뉴 목록을 가져옵니다
   */
  getMenus(roomId: string): MenuRecommendation[] {
    const state = this.getStepStateSync(roomId);
    return state ? state.availableMenus : [];
  }
  /**
   * 사용자의 메뉴 선택을 가져옵니다
   */
  getUserSelections(roomId: string, userId: string): string[] {
    const state = this.getStepStateSync(roomId);
    if (!state) return [];

    const selections = state.menuPerUserSelections.get(userId);
    return selections ? Array.from(selections) : [];
  }

  /**
   * 모든 사용자의 메뉴 선택을 가져옵니다
   */
  getAllUserSelections(roomId: string): Map<string, Set<string>> {
    const state = this.getStepStateSync(roomId);
    if (!state) return new Map();

    return state.menuPerUserSelections;
  }

  getAllUserSelectionsSerialized(roomId: string): {
    menuId: string;
    selectedUsers: string[];
  }[] {
    const state = this.getStepStateSync(roomId);
    if (!state) return [];
    const userSelections = state.menuPerUserSelections;
    const serializedUserSelections = Array.from(userSelections.entries()).map(
      ([menuId, selectedUsers]) => ({
        menuId,
        selectedUsers: Array.from(selectedUsers),
      }),
    );
    return serializedUserSelections;
  }

  async getMenuRecommendation(roomId: string): Promise<MenuRecommendation[]> {
    const participants = this.roomStore.getParticipants(roomId);
    if (participants.size === 0) return [];
    const excludeMenu = this.roomStore.getFinalState(roomId)?.excludeMenu;
    const response = (await fetch(
      `${process.env.FOOD_RECOMMEND_SERVER}/v1/recommend`,
      {
        method: 'POST',
        body: JSON.stringify({
          user_ids: Array.from(participants.keys()),
          exclude_menu: excludeMenu,
          top_k: 6,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      },
    ).then((res) => res.json())) as MenuRecommendationResponseDto;
    return response.recommendations;
  }

  calculateFinalMenu(roomId: string): MenuRecommendation | undefined {
    const state = this.getStepStateSync(roomId);
    if (!state) return undefined;
    const room = this.roomStore.getRoom(roomId);
    if (!room) return undefined;
    let finalMenu: MenuRecommendation | undefined;
    let maxVotes = 0;
    state.availableMenus.forEach((menu) => {
      const votes = state.menuPerUserSelections.get(menu.label);
      if (votes && votes.size > maxVotes) {
        maxVotes = votes.size;
        finalMenu = menu;
      }
    });
    return finalMenu;
  }

  /**
   * 모든 참여자가 메뉴 선택을 완료했는지 확인합니다
   */
  // allUsersCompletedSelection(roomId: string): boolean {
  //   const state = this.getStepState(roomId);
  //   if (!state) return false;

  //   const participants = this.getParticipants(roomId);
  //   if (!participants) return false;

  //   for (const [userId] of participants) {
  //     const selections = state.userSelections.get(userId);
  //     if (!selections || selections.size === 0) {
  //       return false;
  //     }
  //   }

  //   return true;
  // }
}
