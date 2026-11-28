import type { Server } from 'socket.io';
import { RoomHandlers } from '../gateway/room.gateway';
import { RoomStoreService } from './room.service';
import { checkStageOutcome, isTie } from './stage-outcome';

const logger = { log: () => {}, error: () => {} } as never;

function setup(kind: 'invitation' | 'announcement', stage: string) {
  const store = new RoomStoreService(logger, {} as never);
  const roomId = `${kind}:5`;
  if (kind === 'invitation')
    store.seedFromInvitation(roomId, {
      participants: [
        { userId: '1', username: 'a' },
        { userId: '2', username: 'b' },
      ],
      recentMenu: [],
    } as never);
  else
    store.seedFromAnnouncement(roomId, {
      participants: ['1', '2', '3', '4'].map((u) => ({
        userId: u,
        userName: u,
      })),
      recentMenu: [],
    } as never);
  store.setStage(roomId, stage as never);
  const emitted: Array<{ ev: string; payload: any }> = [];
  const persist = jest.fn().mockResolvedValue(undefined);
  const handlers = new RoomHandlers(logger, store, {
    saveConfirmedRestaurant: persist,
    saveInvitationResult: persist,
  } as never);
  const server = {
    to: () => ({
      emit: (ev: string, payload: unknown) => emitted.push({ ev, payload }),
    }),
  } as unknown as Server;
  if (kind === 'invitation') handlers.handleAutoProgressInvitation(server);
  else handlers.handleAutoProgressAnnouncement(server);
  const complete = async () => {
    store.getEventEmitter().emit('ready-state-completed', { roomId, stage });
    await new Promise((r) => setImmediate(r));
  };
  return { store, roomId, emitted, persist, complete };
}

describe('F55·F60 단계 결과 미확정 시 재선택', () => {
  it('isTie', () => {
    expect(isTie([2, 2, 0])).toBe(true);
    expect(isTie([2, 1])).toBe(false);
    expect(isTie([0, 0])).toBe(false);
    expect(isTie([])).toBe(false);
  });

  it('(F60) 공통 시간 없음 → 안내와 함께 날짜 단계로 돌아가고 시간 선택을 비운다', async () => {
    const t = setup('invitation', 'time');
    const room = t.store.getRoom(t.roomId)!;
    room.date = {
      pickedByUser: new Map([
        ['1', ['26. 12. 20']],
        ['2', ['26. 12. 20']],
      ]),
    };
    room.time = {
      pickedByUser: new Map([
        ['1', ['10:00–11:00']],
        ['2', ['12:00–13:00']],
      ]),
    };
    room.final.date = '26. 12. 20';
    room.final.time = ''; // TimeService.calculateFinalTime → undefined
    await t.complete();
    expect(t.store.getStage(t.roomId)).toBe('date');
    expect(room.time).toBeUndefined();
    expect(room.date.pickedByUser.size).toBe(2);
    const sc = t.emitted.find((e) => e.ev === 'stage-changed')!.payload;
    expect(sc).toMatchObject({
      stage: 'date',
      reason: 'no-common-time',
      message: '모두가 가능한 시간대가 없어요. 날짜를 다시 정할게요',
    });
  });

  it('공통 날짜 없음 → 날짜 단계 유지', async () => {
    const t = setup('invitation', 'date');
    t.store.getRoom(t.roomId)!.final.date = '';
    await t.complete();
    expect(t.store.getStage(t.roomId)).toBe('date');
    expect(
      t.emitted.find((e) => e.ev === 'stage-changed')!.payload.reason,
    ).toBe('no-common-date');
  });

  it('공통 시간이 있으면 location 으로 진행(기존 흐름)', async () => {
    const t = setup('invitation', 'time');
    t.store.getRoom(t.roomId)!.final.time = '13:00–14:00';
    await t.complete();
    expect(t.store.getStage(t.roomId)).toBe('location');
    expect(
      t.emitted.find((e) => e.ev === 'stage-changed')!.payload.reason,
    ).toBeUndefined();
  });

  it('(F55) 메뉴 동점 → 메뉴 단계 유지, 준비 해제, 동점 안내', async () => {
    const t = setup('announcement', 'menu');
    const room = t.store.getRoom(t.roomId)!;
    room.menu = {
      availableMenus: [
        { code: 'a', label: '초밥' },
        { code: 'b', label: '국밥' },
      ],
      menuPerUserSelections: new Map([
        ['초밥', new Set(['1', '2'])],
        ['국밥', new Set(['3', '4'])],
      ]),
      maxMenusPerUser: 1,
    };
    ['1', '2', '3', '4'].forEach(
      (u) => (room.participants.get(u)!.ready = true),
    );
    await t.complete();
    expect(t.store.getStage(t.roomId)).toBe('menu');
    expect(t.store.getParticipantReadyCount(t.roomId)).toBe(0);
    expect(
      t.emitted.find((e) => e.ev === 'stage-changed')!.payload,
    ).toMatchObject({
      stage: 'menu',
      reason: 'tie',
    });
  });

  it('(F55) 식당 동점이면 Spring 에 저장하지 않는다', async () => {
    const t = setup('announcement', 'restaurant');
    const room = t.store.getRoom(t.roomId)!;
    room.restaurant = {
      initialRestaurants: [],
      restaurantUserList: new Map([
        ['1', 'r1'],
        ['2', 'r1'],
        ['3', 'r2'],
        ['4', 'r2'],
      ]),
    };
    room.final.restaurant = { id: 'r1', name: 'x', lat: 0, lng: 0 };
    await t.complete();
    expect(t.persist).not.toHaveBeenCalled();
    expect(t.store.getStage(t.roomId)).toBe('restaurant');
  });

  it('장소 투표 동점 판정과 단독 1위', () => {
    const store = new RoomStoreService(logger, {} as never);
    store.seedFromAnnouncement('announcement:1', {
      participants: [],
      recentMenu: [],
    } as never);
    const room = store.getRoom('announcement:1')!;
    room.location = {
      candidates: new Map(),
      votes: new Map([
        ['c1', new Set(['1'])],
        ['c2', new Set(['2'])],
      ]),
      maxCandidates: 20,
    };
    expect(checkStageOutcome(room, 'location-vote')?.reason).toBe('tie');
    room.location.votes.get('c1')!.add('3');
    expect(checkStageOutcome(room, 'location-vote')).toBeUndefined();
  });
});
