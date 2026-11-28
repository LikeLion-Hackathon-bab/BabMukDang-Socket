import { RoomStoreService } from 'src/domain/room/services/room.service';
import { MenuService } from './menu.service';
import {
  buildMenuBallot,
  FALLBACK_MENUS,
  isBallotMenu,
  MENU_BALLOT_SIZE,
} from './menu-candidates';

const food = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    code: `0101400${i}`,
    label: `메뉴${i}`,
  }));

describe('메뉴 투표 후보 거르기', () => {
  it('음식이 아닌 분류와 이름 없는 코드를 뺀다', () => {
    const junk = [
      { code: '00000000', label: '식별불가' },
      { code: '00000001', label: 'blank1' },
      { code: '00000002', label: 'blank2' },
      { code: 'spoon', label: '숟가락' },
      { code: '15011018', label: 'test1' },
      { code: '15011019', label: 'test3' },
      { code: '99999999', label: '' },
      { code: '99999998' },
      { code: '99999997', label: '99999997' },
      { code: '', label: '이름만' },
    ];
    junk.forEach((m) => expect(isBallotMenu(m)).toBe(false));
    expect(isBallotMenu({ code: '05011001', label: '비빔밥' })).toBe(true);
  });

  it('거른 뒤 모자라면 다음 추천 항목으로 채워 6개를 유지한다', () => {
    const rec = [
      { code: '00000000', label: '식별불가' },
      ...food(2),
      { code: 'spoon', label: '숟가락' },
      { code: '00000001', label: 'blank1' },
      ...food(6).slice(2),
    ];
    const out = buildMenuBallot(rec);
    expect(out).toHaveLength(MENU_BALLOT_SIZE);
    expect(out.map((m) => m.label)).toEqual(food(6).map((m) => m.label));
  });

  it('추천이 다 걸러지거나 비면 기본 메뉴로 채우고 제외 메뉴·중복은 넣지 않는다', () => {
    const rec = [
      { code: '00000002', label: 'blank2' },
      { code: '05011001', label: '비빔밥' },
      { code: '05011001', label: '비빔밥' },
    ];
    const out = buildMenuBallot(rec, [FALLBACK_MENUS[0]]);
    expect(out).toHaveLength(MENU_BALLOT_SIZE);
    expect(out[0]).toEqual({ code: '05011001', label: '비빔밥' });
    expect(out).not.toContainEqual(FALLBACK_MENUS[0]);
    expect(new Set(out.map((m) => m.code)).size).toBe(out.length);
    expect(buildMenuBallot(undefined)).toHaveLength(MENU_BALLOT_SIZE);
  });

  it('메뉴 단계 초기 상태가 추천 서버 응답을 걸러서 투표에 올린다', async () => {
    const store = new RoomStoreService(
      { log: () => {}, error: () => {}, warn: () => {} } as never,
      {} as never,
    );
    store.seedFromAnnouncement('announcement:1', {
      participants: [{ userId: '1', userName: 'a' }],
      recentMenu: [],
    } as never);
    const svc = new MenuService(store);
    const original = global.fetch;
    let body: { top_k?: number } = {};
    global.fetch = jest.fn((_url: unknown, init?: { body?: string }) => {
      body = JSON.parse(init?.body ?? '{}') as { top_k?: number };
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            recommendations: [
              { code: '00000000', label: '식별불가' },
              { code: '15011018', label: 'test1' },
              { code: '05011001', label: '비빔밥' },
              { code: '12345678' },
            ],
          }),
      });
    }) as unknown as typeof fetch;
    try {
      const state = await (
        svc as unknown as {
          createInitialState: (id: string) => Promise<{
            availableMenus: { code: string; label: string }[];
          }>;
        }
      ).createInitialState('announcement:1');
      expect(body.top_k).toBeGreaterThan(MENU_BALLOT_SIZE);
      expect(state.availableMenus).toHaveLength(MENU_BALLOT_SIZE);
      expect(state.availableMenus[0].label).toBe('비빔밥');
      expect(state.availableMenus.map((m) => m.label)).not.toContain(
        '식별불가',
      );
    } finally {
      global.fetch = original;
    }
  });
});
