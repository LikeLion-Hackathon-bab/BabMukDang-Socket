import { Id } from 'src/domain/common/types';

export interface MenuStore {
  availableMenus: MenuRecommendation[]; // menuId -> MenuRecommendation
  menuPerUserSelections: Map<Id, Set<Id>>; // menuId -> Set<userId>
  maxMenusPerUser: number; // 사용자당 최대 선택 가능한 메뉴 수
  selectionDeadline?: number; // 선택 마감 시간 (timestamp)
}

export interface MenuRecommendation {
  code: Id;
  label: string;
}

// recommendations": [
//   {
//       "code": "05011001",
//       "label": "비빔밥",
//       "group_score": 0.5099,
//       "member_scores": {
//           "user_a": 0.5929,
//           "user_b": 0.4659,
//           "user_c": 0.6503,
//           "user_d": 0.3304
//       },
//       "reasons": [
//           "중간 취향",
//           "최근 3일 내 미섭취"
//       ]
//   },
//   {
//       "code": "02011027",
//       "label": "자장면",
//       "group_score": 0.5018,
//       "member_scores": {
//           "user_a": 0.4136,
//           "user_b": 0.6258,
//           "user_c": 0.546,
//           "user_d": 0.4218
//       },
//       "reasons": [
//           "중간 취향",
//           "최근 3일 내 미섭취"
//       ]
//   },
//   {
//       "code": "03021005",
//       "label": "불고기",
//       "group_score": 0.4147,
//       "member_scores": {
//           "user_a": 0.3724,
//           "user_b": 0.5468,
//           "user_c": 0.4242,
//           "user_d": 0.3153
//       },
//       "reasons": [
//           "중간 취향",
//           "최근 3일 내 미섭취"
//       ]
//   },
//   {
//       "code": "11015001",
//       "label": "잡채",
//       "group_score": 0.3725,
//       "member_scores": {
//           "user_a": 0.3518,
//           "user_b": 0.3133,
//           "user_c": 0.3949,
//           "user_d": 0.4299
//       },
//       "reasons": [
//           "중간 취향",
//           "최근 3일 내 미섭취"
//       ]
//   }
// ],
