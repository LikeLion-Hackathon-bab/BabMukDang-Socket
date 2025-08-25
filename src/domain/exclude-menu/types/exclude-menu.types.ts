import { Id } from 'src/domain/common/types';
import { MenuRecommendation } from 'src/domain/menu/types/menu.type';

export interface UserMenuCategory {
  userId: string;
  menuList: MenuRecommendation[];
}

export type MenuCode = string;
export interface ExcludeMenuStore {
  userExclusions: Map<Id, Map<MenuCode, MenuRecommendation>>; // userId -> Map<menuCode, MenuRecommendation>
  maxExclusionsPerUser: number; // 사용자당 최대 제외 가능한 카테고리 수
}
