/**
 * 완료(식당 확정 → finish) 전이를 실제 RoomStoreService·RoomHandlers·ServerService 와
 * 가짜 Spring HTTP 서버로 재현한다.
 *  (c) 같은 완료가 두 번 오면 Spring 저장이 두 번 호출되는가
 *  (d) Spring 응답 실패·지연 시 단계 전이
 */
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import type { Server } from 'socket.io';
import { RoomStoreService } from '../services/room.service';
import { ServerService } from '../services/server.service';
import { RoomHandlers } from '../gateway/room.gateway';
import { FakeSpring, QA_ENV, sleep } from './harness';

jest.setTimeout(30_000);

const ROOM = 'announcement:77';
const USERS = ['11', '12', '13'];
const quietLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
  bind: () => ({ log: () => {} }),
};

async function setup() {
  const spring = new FakeSpring();
  process.env.SPRING_API_SERVER = (await spring.start()) + '/api/v1';
  process.env.ROOM_RESULT_KEY = QA_ENV.ROOM_RESULT_KEY;
  const serverService = new ServerService(new HttpService(axios.create()));
  const store = new RoomStoreService(quietLogger as never, serverService);
  store.seedFromAnnouncement(ROOM, {
    announcementId: '77',
    location: '마포',
    meetingAt: '2026-12-01T12:00',
    participants: USERS.map((u) => ({
      userId: u,
      userName: u,
      userProfileImageURL: '',
    })) as never,
    recentMenu: [] as never,
  });
  store.setStage(ROOM, 'restaurant');
  store.getFinalState(ROOM)!.restaurant = { name: '초밥집' } as never;
  const emitted: Array<{ ev: string; at: number; payload: unknown }> = [];
  const server = {
    to: () => ({
      emit: (ev: string, payload: unknown) =>
        emitted.push({ ev, payload, at: Date.now() }),
    }),
  } as unknown as Server;
  const handlers = new RoomHandlers(quietLogger as never, store, serverService);
  handlers.handleAutoProgressAnnouncement(server);
  const readyAll = () =>
    USERS.forEach((u) => store.updateParticipantReadyState(ROOM, u, true));
  const count = (ev: string) => emitted.filter((e) => e.ev === ev).length;
  const stageChanges = () =>
    emitted
      .filter((e) => e.ev === 'stage-changed')
      .map((e) => (e.payload as { stage: string }).stage);
  return { spring, store, emitted, readyAll, count, stageChanges };
}

describe('완료 전이와 Spring 저장', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => {
    const t = ctx?.store.getRoom(ROOM)?.timeout;
    if (t) clearTimeout(t);
    await ctx?.spring.stop();
  });

  it('(c1) 완료 이벤트가 두 번 겹쳐 와도 Spring 저장·finish 전이는 한 번', async () => {
    ctx = await setup();
    ctx.spring.delayMs = 300;
    const emitter = ctx.store.getEventEmitter();
    emitter.emit('ready-state-completed', {
      roomId: ROOM,
      stage: 'restaurant',
    });
    emitter.emit('ready-state-completed', {
      roomId: ROOM,
      stage: 'restaurant',
    });
    await sleep(800);
    // 늦게 재전달된 같은 완료(이미 finish)
    emitter.emit('ready-state-completed', {
      roomId: ROOM,
      stage: 'restaurant',
    });
    await sleep(500);
    expect(ctx.spring.calls).toHaveLength(1);
    expect(ctx.spring.stored.get('77')).toBe('초밥집');
    expect(ctx.stageChanges()).toEqual(['finish']);
    expect(ctx.store.getStage(ROOM)).toBe('finish');
  });

  it('(c2) Spring 저장이 느린 동안 준비를 다시 눌러도 저장은 한 번', async () => {
    ctx = await setup();
    ctx.spring.delayMs = 4000;
    ctx.readyAll();
    await sleep(3300); // 3초 카운트다운 → 저장 요청 시작
    expect(ctx.spring.calls).toHaveLength(1);
    // 재연결·연타로 같은 사용자가 준비를 다시 보냄
    ctx.store.updateParticipantReadyState(ROOM, '11', true);
    await sleep(5000);
    expect(ctx.spring.calls).toHaveLength(1);
    expect(ctx.stageChanges()).toEqual(['finish']);
    expect(ctx.count('meeting-save-failed')).toBe(0);
  });

  it('(d1) Spring 이 실패하면 식당 단계에 남고, 다시 준비하면 저장 후 finish', async () => {
    ctx = await setup();
    ctx.spring.failNext = 1;
    ctx.readyAll();
    await sleep(3500);
    expect(ctx.count('meeting-save-failed')).toBe(1);
    expect(ctx.store.getStage(ROOM)).toBe('restaurant');
    expect(ctx.store.getRoom(ROOM)).toBeDefined();
    expect(ctx.store.getParticipantReadyCount(ROOM)).toBe(0);
    ctx.readyAll();
    await sleep(3500);
    expect(ctx.spring.calls).toHaveLength(2);
    expect(ctx.stageChanges()).toEqual(['finish']);
  });

  it('(d2) Spring 이 5초 넘게 늦으면(커밋은 됨) 실패 안내 → 같은 식당으로 재시도하면 finish', async () => {
    ctx = await setup();
    ctx.spring.delayMs = 5600;
    ctx.readyAll();
    await sleep(3000 + 5400);
    expect(ctx.count('meeting-save-failed')).toBe(1);
    expect(ctx.store.getStage(ROOM)).toBe('restaurant');
    await sleep(400); // Spring 은 늦게나마 커밋
    expect(ctx.spring.stored.get('77')).toBe('초밥집');
    ctx.spring.delayMs = 0;
    ctx.readyAll();
    await sleep(3500);
    expect(ctx.stageChanges()).toEqual(['finish']);
  });
});

describe('공고 409 저장값 채택 (contracts/meeting-result.md)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => {
    const t = ctx?.store.getRoom(ROOM)?.timeout;
    if (t) clearTimeout(t);
    await ctx?.spring.stop();
  });

  it('(d3) 시간 초과 뒤 Spring 이 늦게 커밋했고 사람들이 식당을 바꿔 다시 준비 → 409 저장값으로 finish', async () => {
    ctx = await setup();
    ctx.spring.stored.set('77', '초밥집'); // 앞 요청이 늦게 커밋됨
    ctx.store.getFinalState(ROOM)!.restaurant = {
      name: '돈까스집',
      place_name: '돈까스집',
    } as never;
    ctx.readyAll();
    await sleep(3500);
    expect(ctx.spring.calls.map((c) => c.restaurant)).toEqual(['돈까스집']);
    expect(ctx.count('meeting-save-failed')).toBe(0);
    expect(ctx.stageChanges()).toEqual(['finish']);
    const fin = ctx.store.getFinalState(ROOM)!.restaurant as unknown as {
      name: string;
      place_name: string;
    };
    expect([fin.name, fin.place_name]).toEqual(['초밥집', '초밥집']);
    expect(ctx.count('final-state-response')).toBe(1);
  });
});

const INV = 'invitation:3';
async function setupInvitation() {
  const spring = new FakeSpring();
  process.env.SPRING_API_SERVER = (await spring.start()) + '/api/v1';
  process.env.ROOM_RESULT_KEY = QA_ENV.ROOM_RESULT_KEY;
  const serverService = new ServerService(new HttpService(axios.create()));
  const store = new RoomStoreService(quietLogger as never, serverService);
  store.seedFromInvitation(INV, {
    invitationId: '3',
    participants: [
      { userId: '1', username: '보낸사람', userProfileImageURL: '' },
      { userId: '2', username: '받은사람', userProfileImageURL: '' },
    ],
    recentMenu: [],
  } as never);
  store.setStage(INV, 'restaurant');
  Object.assign(store.getFinalState(INV)!, {
    date: '26. 12. 01',
    time: '13:00–14:00',
    location: {
      id: 'c',
      placeName: '강남역 2번 출구',
      lat: 0,
      lng: 0,
      address: '',
    },
    restaurant: { name: '확정 초밥집', place_name: '확정 초밥집' },
  });
  const emitted: Array<{ ev: string; payload: unknown }> = [];
  const server = {
    to: () => ({
      emit: (ev: string, payload: unknown) => emitted.push({ ev, payload }),
    }),
  } as unknown as Server;
  new RoomHandlers(
    quietLogger as never,
    store,
    serverService,
  ).handleAutoProgressInvitation(server);
  const readyAll = () =>
    ['1', '2'].forEach((u) => store.updateParticipantReadyState(INV, u, true));
  const count = (ev: string) => emitted.filter((e) => e.ev === ev).length;
  const stages = () =>
    emitted
      .filter((e) => e.ev === 'stage-changed')
      .map((e) => (e.payload as { stage: string }).stage);
  return { spring, store, readyAll, count, stages, emitted };
}

describe('초대방 결과 저장 (contracts/invitation-result.md)', () => {
  let ctx: Awaited<ReturnType<typeof setupInvitation>>;
  afterEach(async () => {
    const t = ctx?.store.getRoom(INV)?.timeout;
    if (t) clearTimeout(t);
    await ctx?.spring.stop();
  });

  it('(i1) 식당 → finish 전에 KST 오프셋 시각으로 저장하고, 겹친 완료는 한 번만', async () => {
    ctx = await setupInvitation();
    ctx.spring.delayMs = 300;
    const em = ctx.store.getEventEmitter();
    em.emit('ready-state-completed', { roomId: INV, stage: 'restaurant' });
    em.emit('ready-state-completed', { roomId: INV, stage: 'restaurant' });
    await sleep(800);
    em.emit('ready-state-completed', { roomId: INV, stage: 'restaurant' });
    await sleep(300);
    expect(ctx.spring.invitationCalls).toHaveLength(1);
    expect(ctx.spring.invitationCalls[0].body).toEqual({
      invitationId: 3,
      meetingAt: '2026-12-01T13:00:00+09:00',
      location: '강남역 2번 출구',
      restaurant: '확정 초밥집',
    });
    expect(ctx.stages()).toEqual(['finish']);
    // finish 에서 모두 준비 → meeting-saved, 방 삭제
    em.emit('ready-state-completed', { roomId: INV, stage: 'finish' });
    await sleep(50);
    expect(ctx.count('meeting-saved')).toBe(1);
    expect(ctx.store.getRoom(INV)).toBeUndefined();
  });

  it('(i2) Spring 실패 → 식당 단계 유지·실패 안내, 다시 준비하면 저장 후 finish', async () => {
    ctx = await setupInvitation();
    ctx.spring.failNext = 1;
    ctx.readyAll();
    await sleep(3500);
    expect(ctx.count('meeting-save-failed')).toBe(1);
    expect(ctx.store.getStage(INV)).toBe('restaurant');
    expect(ctx.store.getParticipantReadyCount(INV)).toBe(0);
    ctx.readyAll();
    await sleep(3500);
    expect(ctx.spring.invitationCalls).toHaveLength(2);
    expect(ctx.stages()).toEqual(['finish']);
  });

  it('(i3) 409 data(이미 다른 값으로 저장) → 저장값을 채택해 finish', async () => {
    ctx = await setupInvitation();
    ctx.spring.invitationStored.set('3', {
      meetingAt: '2026-12-01T05:00:00Z', // = KST 14:00
      location: '역삼역',
      restaurant: '먼저 커밋된 집',
    });
    ctx.store
      .getEventEmitter()
      .emit('ready-state-completed', { roomId: INV, stage: 'restaurant' });
    await sleep(500);
    expect(ctx.stages()).toEqual(['finish']);
    const f = ctx.store.getFinalState(INV)!;
    expect(f.restaurant!.name).toBe('먼저 커밋된 집');
    expect(f.location!.placeName).toBe('역삼역');
    expect([f.date, f.time]).toEqual(['26. 12. 01', '14:00']);
    expect(ctx.count('final-state-response')).toBe(1);
  });

  it('(i4) 409 without data(수락되지 않은 초대)·결과 누락은 finish 로 가지 않는다', async () => {
    ctx = await setupInvitation();
    ctx.spring.acceptedInvitations.clear();
    const em = ctx.store.getEventEmitter();
    em.emit('ready-state-completed', { roomId: INV, stage: 'restaurant' });
    await sleep(500);
    expect(ctx.count('meeting-save-failed')).toBe(1);
    ctx.spring.acceptedInvitations.add('3');
    ctx.store.getFinalState(INV)!.time = '';
    em.emit('ready-state-completed', { roomId: INV, stage: 'restaurant' });
    await sleep(300);
    expect(ctx.count('meeting-save-failed')).toBe(2);
    expect(ctx.spring.invitationCalls).toHaveLength(1);
    expect(ctx.stages()).toEqual([]);
  });
});
