export interface MenuRecommendationAIResponseDto {
  group_id: string | null;
  user_ids: string[];
  exclude_days: number;
  per_user: PerUser[];
  group_excluded: GroupExcluded;
  recommendations: Recommendation[];
  params: Params;
}

interface PerUser {
  user_id: string;
  excluded_codes: string[];
  overrides_applied: string[];
  taste_top: TasteTop[];
}
interface TasteTop {
  code: string;
  label: string;
  score: number;
}

interface GroupExcluded {
  mode: string;
  codes: string[];
}

export interface Recommendation {
  code: string;
  label: string;
  group_score: number;
  member_scores: MemberScores;
  reasons: string[];
}
export interface MemberScores {
  [key: string]: number;
}

interface Params {
  taste_mode: string;
  exclude_mode: string;
  weights: object;
  top_k: number;
}

export const MenuRecommendationAIResponseDto: MenuRecommendationAIResponseDto =
  {
    group_id: null,
    user_ids: ['user_a', 'user_b', 'user_c'],
    exclude_days: 3,
    per_user: [
      {
        user_id: 'user_a',
        excluded_codes: [],
        overrides_applied: [],
        taste_top: [
          {
            code: '02011027',
            label: '자장면',
            score: 0.5784,
          },
          {
            code: '11015001',
            label: '잡채',
            score: 0.3671,
          },
          {
            code: '03021005',
            label: '불고기',
            score: 0.3451,
          },
          {
            code: '05011001',
            label: '비빔밥',
            score: 0.3212,
          },
        ],
      },
      {
        user_id: 'user_b',
        excluded_codes: [],
        overrides_applied: [],
        taste_top: [
          {
            code: '05011001',
            label: '비빔밥',
            score: 0.4793,
          },
          {
            code: '11015001',
            label: '잡채',
            score: 0.4052,
          },
          {
            code: '03021005',
            label: '불고기',
            score: 0.3189,
          },
          {
            code: '02011027',
            label: '자장면',
            score: 0.3103,
          },
        ],
      },
      {
        user_id: 'user_c',
        excluded_codes: [],
        overrides_applied: [],
        taste_top: [
          {
            code: '02011027',
            label: '자장면',
            score: 0.6998,
          },
          {
            code: '11015001',
            label: '잡채',
            score: 0.4993,
          },
          {
            code: '05011001',
            label: '비빔밥',
            score: 0.4701,
          },
          {
            code: '03021005',
            label: '불고기',
            score: 0.3383,
          },
        ],
      },
    ],
    group_excluded: {
      mode: 'union',
      codes: [],
    },
    recommendations: [
      {
        code: '02011027',
        label: '자장면',
        group_score: 0.5295,
        member_scores: {
          user_a: 0.5784,
          user_b: 0.3103,
          user_c: 0.6998,
        },
        reasons: ['중간 취향', '최근 3일 내 미섭취'],
      },
      {
        code: '11015001',
        label: '잡채',
        group_score: 0.4239,
        member_scores: {
          user_a: 0.3671,
          user_b: 0.4052,
          user_c: 0.4993,
        },
        reasons: ['중간 취향', '최근 3일 내 미섭취'],
      },
      {
        code: '05011001',
        label: '비빔밥',
        group_score: 0.4235,
        member_scores: {
          user_a: 0.3212,
          user_b: 0.4793,
          user_c: 0.4701,
        },
        reasons: ['중간 취향', '최근 3일 내 미섭취'],
      },
      {
        code: '03021005',
        label: '불고기',
        group_score: 0.3341,
        member_scores: {
          user_a: 0.3451,
          user_b: 0.3189,
          user_c: 0.3383,
        },
        reasons: ['중간 취향', '최근 3일 내 미섭취'],
      },
    ],
    params: {
      taste_mode: 'mean',
      exclude_mode: 'union',
      weights: {},
      top_k: 10,
    },
  };

// 예시

// {
//     "group_id": null,
//     "user_ids": [
//         "user_a",
//         "user_b",
//         "user_c"
//     ],
//     "exclude_days": 3,
//     "per_user": [
//         {
//             "user_id": "user_a",
//             "excluded_codes": [],
//             "overrides_applied": [],
//             "taste_top": [
//                 {
//                     "code": "02011027",
//                     "label": "자장면",
//                     "score": 0.5784
//                 },
//                 {
//                     "code": "11015001",
//                     "label": "잡채",
//                     "score": 0.3671
//                 },
//                 {
//                     "code": "03021005",
//                     "label": "불고기",
//                     "score": 0.3451
//                 },
//                 {
//                     "code": "05011001",
//                     "label": "비빔밥",
//                     "score": 0.3212
//                 }
//             ]
//         },
//         {
//             "user_id": "user_b",
//             "excluded_codes": [],
//             "overrides_applied": [],
//             "taste_top": [
//                 {
//                     "code": "05011001",
//                     "label": "비빔밥",
//                     "score": 0.4793
//                 },
//                 {
//                     "code": "11015001",
//                     "label": "잡채",
//                     "score": 0.4052
//                 },
//                 {
//                     "code": "03021005",
//                     "label": "불고기",
//                     "score": 0.3189
//                 },
//                 {
//                     "code": "02011027",
//                     "label": "자장면",
//                     "score": 0.3103
//                 }
//             ]
//         },
//         {
//             "user_id": "user_c",
//             "excluded_codes": [],
//             "overrides_applied": [],
//             "taste_top": [
//                 {
//                     "code": "02011027",
//                     "label": "자장면",
//                     "score": 0.6998
//                 },
//                 {
//                     "code": "11015001",
//                     "label": "잡채",
//                     "score": 0.4993
//                 },
//                 {
//                     "code": "05011001",
//                     "label": "비빔밥",
//                     "score": 0.4701
//                 },
//                 {
//                     "code": "03021005",
//                     "label": "불고기",
//                     "score": 0.3383
//                 }
//             ]
//         }
//     ],
//     "group_excluded": {
//         "mode": "union",
//         "codes": []
//     },
//     "recommendations": [
//         {
//             "code": "02011027",
//             "label": "자장면",
//             "group_score": 0.5295,
//             "member_scores": {
//                 "user_a": 0.5784,
//                 "user_b": 0.3103,
//                 "user_c": 0.6998
//             },
//             "reasons": [
//                 "중간 취향",
//                 "최근 3일 내 미섭취"
//             ]
//         },
//         {
//             "code": "11015001",
//             "label": "잡채",
//             "group_score": 0.4239,
//             "member_scores": {
//                 "user_a": 0.3671,
//                 "user_b": 0.4052,
//                 "user_c": 0.4993
//             },
//             "reasons": [
//                 "중간 취향",
//                 "최근 3일 내 미섭취"
//             ]
//         },
//         {
//             "code": "05011001",
//             "label": "비빔밥",
//             "group_score": 0.4235,
//             "member_scores": {
//                 "user_a": 0.3212,
//                 "user_b": 0.4793,
//                 "user_c": 0.4701
//             },
//             "reasons": [
//                 "중간 취향",
//                 "최근 3일 내 미섭취"
//             ]
//         },
//         {
//             "code": "03021005",
//             "label": "불고기",
//             "group_score": 0.3341,
//             "member_scores": {
//                 "user_a": 0.3451,
//                 "user_b": 0.3189,
//                 "user_c": 0.3383
//             },
//             "reasons": [
//                 "중간 취향",
//                 "최근 3일 내 미섭취"
//             ]
//         }
//     ],
//     "params": {
//         "taste_mode": "mean",
//         "exclude_mode": "union",
//         "weights": {},
//         "top_k": 10
//     }
// }
