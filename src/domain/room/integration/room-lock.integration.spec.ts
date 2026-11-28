/**
 * 리뷰 S1·S4 회귀 시험.
 * S1: 카운트다운·Spring 저장 대기 중 표/준비 변경을 받지 않아 판정·확정·저장이 같은 표를 본다.
 * S4: 준비했던 사람이 재접속하면 남은 사람에게도 줄어든 준비 수가 간다.
 */
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'socket.io';
import { RoomStoreService } from '../services/room.service';
import { ServerService } from '../services/server.service';
import { RoomHandlers } from '../gateway/room.gateway';
import { RestaurantService } from 'src/domain/restaurant/services/restaurant.service';
import {
  FakeSpring,
  QA_ENV,
  allReadyAndAdvance,
  bootApp,
  connectUser,
  connected,
  seedAnnouncement,
  sleep,
  type QaClient,
} from './harness';

jest.setTimeout(40_000);
const quiet = {
  log: () => {},
  error: () => {},
  warn: () => {},
  bind: () => ({ log: () => {} }),
};
type Cand = { id: string; placeName: string };

describe('room lock (S1)', () => {
  const users = ['11', '12', '13'];
  let app: INestApplication | undefined;
  let clients: QaClient[] = [];
  afterEach(async () => {
    clients.forEach((c) => c.close());
    clients = [];
    if (app) await app.close();
    app = undefined;
  });

  it('S1: 카운트다운 중 투표는 거부되어 동점 판정과 확정값이 같은 표를 본다', async () => {
    const booted = await bootApp(0);
    app = booted.app;
    const roomId = `${Date.now() % 100000}7`;
    await seedAnnouncement(booted.port, roomId, users);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    await allReadyAndAdvance(clients, 'location');
    clients
      .slice(0, 2)
      .forEach((c, i) =>
        c.socket.emit('add-location-candidate', {
          placeName: `cand-${c.userId}`,
          lat: 37 + i / 10,
          lng: 127,
          address: `a${i}`,
        }),
      );
    await sleep(500);
    const lists = clients[0].of('location-candidate-added') as Cand[][];
    const byName = Object.fromEntries(
      lists[lists.length - 1].map((x) => [x.placeName, x.id]),
    );
    await allReadyAndAdvance(clients, 'location-vote');
    const [u1, u2, u3] = clients;
    u1.socket.emit('vote-location', { candidateId: byName['cand-11'] });
    u2.socket.emit('vote-location', { candidateId: byName['cand-12'] });
    await sleep(300);
    clients.forEach((c) => c.socket.emit('ready-state', { isReady: true }));
    await sleep(500);
    const since = Date.now();
    u3.socket.emit('vote-location', { candidateId: byName['cand-12'] });
    const st = await u1.waitFor<{ stage: string; reason?: string }>(
      'stage-changed',
      (p) => p.stage !== 'location-vote' || !!p.reason,
      6000,
      since,
    );
    // 늦은 표는 반영되지 않았으므로 1:1 동점으로 재투표
    expect(st).toMatchObject({ stage: 'location-vote', reason: 'tie' });
    const updates = u1.events.filter(
      (e) => e.ev === 'location-vote-updated' && e.at >= since,
    );
    expect(updates).toHaveLength(0);
  });

  it('S1: Spring 저장 대기 중 준비 해제·선택 변경·재준비는 거부되고 확정값은 보낸 값으로 고정된다', async () => {
    const spring = new FakeSpring();
    process.env.SPRING_API_SERVER = (await spring.start()) + '/api/v1';
    process.env.ROOM_RESULT_KEY = QA_ENV.ROOM_RESULT_KEY;
    try {
      const ss = new ServerService(new HttpService(axios.create()));
      const store = new RoomStoreService(quiet as never, ss);
      const ROOM = 'announcement:77';
      store.seedFromAnnouncement(ROOM, {
        announcementId: '77',
        location: 'x',
        meetingAt: '2026-12-01T12:00',
        participants: users.map((u) => ({
          userId: u,
          userName: u,
          userProfileImageURL: '',
        })),
        recentMenu: [],
      } as never);
      const rs = new RestaurantService(store);
      store.setStage(ROOM, 'restaurant');
      const room = store.getRoom(ROOM)!;
      room.restaurant = {
        initialRestaurants: [
          { id: 'A', name: 'A집', lat: 0, lng: 0 },
          { id: 'B', name: 'B집', lat: 0, lng: 0 },
        ],
        restaurantUserList: new Map(),
      } as never;
      users.forEach((u) => rs.pickRestaurant(ROOM, u, 'A'));
      const emitted: Array<{ ev: string; p: unknown }> = [];
      const server = {
        to: () => ({
          emit: (ev: string, p: unknown) => emitted.push({ ev, p }),
        }),
      } as unknown as Server;
      new RoomHandlers(quiet as never, store, ss).handleAutoProgressAnnouncement(
        server,
      );
      spring.delayMs = 3000;
      users.forEach((u) => store.updateParticipantReadyState(ROOM, u, true));
      await sleep(3300);
      expect(store.isLocked(ROOM)).toBe(true);
      expect(store.updateParticipantReadyState(ROOM, '11', false)).toBe(false);
      rs.pickRestaurant(ROOM, '11', 'B');
      rs.pickRestaurant(ROOM, '12', 'B');
      // 누군가 확정값을 다시 계산해도 저장 뒤에는 보낸 값으로 돌아온다
      store
        .getEventEmitter()
        .emit('request-final-state', { roomId: ROOM, stage: 'restaurant' });
      await sleep(3500);
      expect(spring.calls.map((c) => c.restaurant)).toEqual(['A집']);
      expect(store.getStage(ROOM)).toBe('finish');
      expect(store.getFinalState(ROOM)?.restaurant?.name).toBe('A집');
    } finally {
      await spring.stop();
    }
  });
});
