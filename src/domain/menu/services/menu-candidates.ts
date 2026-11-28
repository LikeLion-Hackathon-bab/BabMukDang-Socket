import type { MenuRecommendation } from '../types/menu.type';

/** 투표에 올리는 메뉴 수 */
export const MENU_BALLOT_SIZE = 6;
/** 걸러질 것을 감안해 추천 서버에 더 달라고 한다 */
export const MENU_RECOMMEND_TOP_K = 12;

/**
 * 추천 AI 가 음식이 아닌 분류를 돌려줄 때가 있다(CDN 스레드 확인: 식별불가, blank1/2, 숟가락, test1/test3).
 * 분류 목록 categories.json 의 id 기준이다.
 */
const DENY_CODES = new Set([
  '00000000', // 식별불가
  '00000001', // blank1
  '00000002', // blank2
  '15011018', // test1
  '15011019', // test3
  'spoon', // 숟가락
]);
const DENY_LABELS = new Set(['식별불가', '숟가락']);
const DENY_LABEL_PATTERN = /^(blank|test)\s*\d*$/i;

/**
 * 추천이 모자랄 때 채우는 흔한 메뉴. code 는 categories.json 의 실제 id(CDN 이미지가 있다).
 */
export const FALLBACK_MENUS: MenuRecommendation[] = [
  { code: '01014004', label: '일반비빔밥' },
  { code: '04017001', label: '된장찌개' },
  { code: '10012003', label: '돈가스' },
  { code: '02011029', label: '짬뽕' },
  { code: '01015010', label: '제육덮밥' },
  { code: '02011013', label: '물냉면' },
  { code: '08014001', label: '떡볶이' },
  { code: '01016011', label: '연어초밥' },
  { code: '01014001', label: '김치볶음밥' },
  { code: '02011036', label: '해물칼국수' },
];

/** 음식으로 투표에 올릴 수 있는 후보인가. label 이 없거나 code 와 같으면(이름 없는 코드) 뺀다 */
export function isBallotMenu(
  m: Partial<MenuRecommendation> | undefined,
): boolean {
  if (!m) return false;
  const code = typeof m.code === 'string' ? m.code.trim() : '';
  const label = typeof m.label === 'string' ? m.label.trim() : '';
  if (!code || !label || label === code) return false;
  if (DENY_CODES.has(code)) return false;
  if (DENY_LABELS.has(label) || DENY_LABEL_PATTERN.test(label)) return false;
  return true;
}

/**
 * 추천 순서를 지키며 음식이 아닌 것·중복·제외 메뉴를 빼고 size 개를 고른다.
 * 모자라면 다음 추천 항목(이미 순서대로 본다), 그다음 FALLBACK_MENUS 로 채운다.
 */
export function buildMenuBallot(
  recommended: Array<Partial<MenuRecommendation>> | undefined,
  excluded: Array<Partial<MenuRecommendation>> = [],
  size = MENU_BALLOT_SIZE,
): MenuRecommendation[] {
  const excludedKeys = new Set(
    excluded.flatMap((e) => [e?.code, e?.label]).filter(Boolean) as string[],
  );
  const out: MenuRecommendation[] = [];
  const seenCodes = new Set<string>();
  const seenLabels = new Set<string>();
  const take = (m: Partial<MenuRecommendation>) => {
    if (out.length >= size || !isBallotMenu(m)) return;
    const code = m.code!.trim();
    const label = m.label!.trim();
    if (seenCodes.has(code) || seenLabels.has(label)) return;
    if (excludedKeys.has(code) || excludedKeys.has(label)) return;
    seenCodes.add(code);
    seenLabels.add(label);
    out.push({ code, label });
  };
  (recommended ?? []).forEach(take);
  FALLBACK_MENUS.forEach(take);
  return out;
}
