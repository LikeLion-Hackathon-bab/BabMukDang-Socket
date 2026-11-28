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
