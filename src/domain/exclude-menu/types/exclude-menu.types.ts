import { Id } from 'src/domain/common/types';

export interface UserMenuCategory {
  userId: string;
  categoryIds: Id[];
}

export type ExclusionCategoryId = Id;
export interface ExcludeMenuStore {
  userExclusions: Map<Id, Set<ExclusionCategoryId>>; // userId -> Set<menuCategoryId>
  finalExclusions: Set<ExclusionCategoryId>; // 최종 제외된 메뉴 카테고리들
  initialUserCategories: UserMenuCategory[]; // 사용 가능한 메뉴 카테고리 목록
  maxExclusionsPerUser: number; // 사용자당 최대 제외 가능한 카테고리 수
}
