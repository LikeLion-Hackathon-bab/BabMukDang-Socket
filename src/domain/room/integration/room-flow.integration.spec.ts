/**
 * 실제 AppModule + socket.io 클라이언트 3명으로 재현:
 *  (a) 서버 프로세스 재시작(앱 인스턴스 교체, 메모리 소실) 후 같은 방 재입장
 *  (a') 네트워크 재연결(서버는 살아 있음)
 *  (b) 동시 채팅 N개·후보 추가·투표 → 수신 정확히 한 번, 최종 집계
 *
 * REDIS_TEST_URL 이 있으면 실제 Redis 로 방 상태를 영속화한다.
 * 없으면 공유 메모리 스냅샷 저장소(재시작 사이에 살아남는 외부 저장소 대역)를 주입한다.
 */
import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import {
  allReadyAndAdvance,
  bootApp,
  connected,
  connectUser,
  type QaClient,
  seedAnnouncement,
  sleep,
} from './harness';

jest.setTimeout(60_000);

type ChatMsg = { messageId: string; text: string; user: { userId: string } };
type Cand = { id: string; userId?: string; placeName: string };
type InitialState = {
  stage?: string;
  initialState?: { candidates: Cand[]; votes: unknown[] };
};

function snapshotOverride():
  | ((b: TestingModuleBuilder) => TestingModuleBuilder)
  | undefined {
  if (process.env.REDIS_TEST_URL) {
    process.env.REDIS_URL = process.env.REDIS_TEST_URL;
    return undefined;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('../persistence/room-snapshot.store') as {
      ROOM_SNAPSHOT_STORE: string;
      MemoryRoomSnapshotStore: new () => unknown;
    };
    const shared = new p.MemoryRoomSnapshotStore();
    return (b) => b.overrideProvider(p.ROOM_SNAPSHOT_STORE).useValue(shared);
  } catch {
    return undefined; // 기준 커밋: 영속화 계층 없음
  }
}

describe('방 상태: 재시작·재연결·동시성', () => {
  const users = ['11', '12', '13'];
  let app: INestApplication | undefined;
  let clients: QaClient[] = [];

  afterEach(async () => {
    clients.forEach((c) => c.close());
    clients = [];
    if (app) await app.close();
    app = undefined;
  });

  it('(a) 서버 재시작 후 같은 방에 다시 들어오면 단계·채팅·후보·투표가 유지된다', async () => {
    const customize = snapshotOverride();
    const roomId = `${Date.now() % 100000}1`;
    let booted = await bootApp(0, customize);
    app = booted.app;
    const port = booted.port;
    expect(await seedAnnouncement(port, roomId, users)).toBe(201);
    clients = users.map((u) => connectUser(port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));

    for (const c of clients) {
      c.socket.emit('chat-message', { text: `hello-${c.userId}-1` });
      c.socket.emit('chat-message', { text: `hello-${c.userId}-2` });
    }
    await allReadyAndAdvance(clients, 'location');
    // (동시 추가 충돌은 (b)에서 따로 본다. 여기서는 간격을 둔다)
    for (const [i, c] of clients.entries()) {
      c.socket.emit('add-location-candidate', {
        placeName: `place-${c.userId}`,
        lat: 37.5 + i / 100,
        lng: 126.9,
        address: `addr-${c.userId}`,
      });
      await sleep(30);
    }
    await clients[0].waitFor<Cand[]>(
      'location-candidate-added',
      (l) => l.length === 3,
    );
    await allReadyAndAdvance(clients, 'location-vote');
    const cands = (
      await clients[0].waitFor<InitialState>(
        'initial-state-response',
        (p) => p.stage === 'location-vote',
      )
    ).initialState!.candidates;
    const target = cands.find((c) => c.placeName === 'place-12')!;
    clients[0].socket.emit('vote-location', { candidateId: target.id });
    clients[1].socket.emit('vote-location', { candidateId: target.id });
    await clients[2].waitFor<{ voteState: Record<string, string[]> }>(
      'location-vote-updated',
      (p) => (p.voteState[target.id] ?? []).length === 2,
    );
    await sleep(200); // 스냅샷 쓰기 여유

    // ---- 재시작: 메모리 소실 ----
    await app.close();
    app = undefined;
    const restartAt = Date.now();
    booted = await bootApp(port, customize);
    app = booted.app;

    await sleep(2500); // 클라이언트 자동 재연결 시간
    const autoReconnected = clients.map((c) => c.socket.connected);
    const errorsAfterRestart = clients.map((c) => c.errors.slice());
    if (!autoReconnected.every(Boolean)) {
      // 화면의 '다시 연결하기' 전에 Spring 이 입장 API 로 방을 다시 준비하는 흐름
      await seedAnnouncement(port, roomId, users);
      for (const c of clients) if (!c.socket.connected) c.socket.connect();
      await Promise.all(clients.map((c) => connected(c).catch(() => {})));
    }
    process.stdout.write(
      JSON.stringify({ restartCase: { autoReconnected, errorsAfterRestart } }) +
        '\n',
    );

    for (const c of clients) {
      const stage = await c.waitFor<{ stage: string }>(
        'stage-changed',
        () => true,
        5000,
        restartAt,
      );
      const chat = await c.waitFor<ChatMsg[]>(
        'chat-messages',
        () => true,
        5000,
        restartAt,
      );
      expect({ user: c.userId, stage: stage.stage, chat: chat.length }).toEqual(
        { user: c.userId, stage: 'location-vote', chat: 6 },
      );
      const init = await c.waitFor<InitialState>(
        'initial-state-response',
        (p) => p.stage === 'location-vote',
        5000,
        restartAt,
      );
      expect(init.initialState!.candidates).toHaveLength(3);
    }
    expect(autoReconnected).toEqual([true, true, true]);

    // Spring 입장 API 가 재시작 뒤 다시 와도(완료 이벤트 재전달 포함) 방을 초기화하지 않는다
    expect(await seedAnnouncement(port, roomId, users)).toBe(201);
    const fresh = connectUser(port, '13', roomId);
    clients.push(fresh);
    const st = await fresh.waitFor<{ stage: string }>('stage-changed');
    expect(st.stage).toBe('location-vote');

    // 재시작 뒤에도 남은 투표가 집계된다
    const since = Date.now();
    clients
      .slice(0, 3)
      .forEach((c) => c.socket.emit('ready-state', { isReady: true }));
    const fin = await clients[0].waitFor<{
      finalState: { location?: Cand };
    }>('final-state-response', (p) => !!p?.finalState?.location, 6000, since);
    expect(fin.finalState.location!.id).toBe(target.id);
  });

  it("(a') 네트워크만 끊겼다 붙으면 놓친 채팅과 투표 상태를 다시 받는다", async () => {
    const roomId = `${Date.now() % 100000}2`;
    const booted = await bootApp(0, snapshotOverride());
    app = booted.app;
    expect(await seedAnnouncement(booted.port, roomId, users)).toBe(201);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    await allReadyAndAdvance(clients, 'location');

    const [a, b, c] = clients;
    await sleep(100);
    const since = Date.now();
    c.socket.io.engine.close(); // 전송 계층만 끊김 → 자동 재연결
    a.socket.emit('chat-message', { text: 'while-away-1' });
    b.socket.emit('chat-message', { text: 'while-away-2' });
    a.socket.emit('add-location-candidate', {
      placeName: 'p-a',
      lat: 37.5,
      lng: 127,
      address: 'x',
    });
    await sleep(50);
    expect(c.socket.connected).toBe(false);
    await connected(c);
    const hist = await c.waitFor<ChatMsg[]>(
      'chat-messages',
      (l) => l.length === 2,
      5000,
      since,
    );
    expect(hist.map((m) => m.text).sort()).toEqual([
      'while-away-1',
      'while-away-2',
    ]);
    const init = await c.waitFor<InitialState>(
      'initial-state-response',
      (p) => p.stage === 'location',
      5000,
      since,
    );
    expect(init.initialState!.candidates.map((x) => x.placeName)).toEqual([
      'p-a',
    ]);
    const st = await c.waitFor<{ stage: string }>(
      'stage-changed',
      () => true,
      5000,
      since,
    );
    expect(st.stage).toBe('location');
  });

  it('(b1) 3명이 동시에 채팅 N개 → 각자 정확히 한 번 수신, 기록 보존', async () => {
    const N = 30;
    const roomId = `${Date.now() % 100000}3`;
    const booted = await bootApp(0, snapshotOverride());
    app = booted.app;
    expect(await seedAnnouncement(booted.port, roomId, users)).toBe(201);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));

    for (let i = 0; i < N; i++)
      for (const c of clients)
        c.socket.emit('chat-message', { text: `${c.userId}:${i}` });
    await sleep(800);
    for (const c of clients) {
      const got = (c.of('chat-message') as ChatMsg[]).map((m) => m.text);
      const expected = clients
        .filter((o) => o !== c)
        .flatMap((o) =>
          Array.from({ length: N }, (_, i) => `${o.userId}:${i}`),
        );
      expect(got.length).toBe(expected.length); // 중복·누락 없음
      expect([...got].sort()).toEqual([...expected].sort());
      // 보낸 사람별 순서 유지
      for (const o of clients.filter((x) => x !== c)) {
        const seq = got
          .filter((t) => t.startsWith(`${o.userId}:`))
          .map((t) => Number(t.split(':')[1]));
        expect(seq).toEqual([...seq].sort((x, y) => x - y));
      }
    }
    const late = connectUser(booted.port, '11', roomId);
    clients.push(late);
    const hist = await late.waitFor<ChatMsg[]>('chat-messages');
    expect(hist).toHaveLength(3 * N);
    expect(new Set(hist.map((m) => m.messageId)).size).toBe(3 * N);
  });

  it('(b2) 3명이 동시에 후보 추가·투표(연타·변경) → 후보 유실 없음, 집계 정확', async () => {
    const roomId = `${Date.now() % 100000}4`;
    const booted = await bootApp(0, snapshotOverride());
    app = booted.app;
    expect(await seedAnnouncement(booted.port, roomId, users)).toBe(201);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    await allReadyAndAdvance(clients.slice(0, 3), 'location');
    // 같은 순간에 세 명이 후보 추가
    clients.slice(0, 3).forEach((c, i) =>
      c.socket.emit('add-location-candidate', {
        placeName: `cand-${c.userId}`,
        lat: 37 + i / 10,
        lng: 127,
        address: `a${i}`,
      }),
    );
    await sleep(500);
    const lists = clients[0].of('location-candidate-added') as Cand[][];
    const last = lists[lists.length - 1];
    expect(last.map((x) => x.placeName).sort()).toEqual([
      'cand-11',
      'cand-12',
      'cand-13',
    ]);
    expect(new Set(last.map((x) => x.id)).size).toBe(3);

    await allReadyAndAdvance(clients.slice(0, 3), 'location-vote');
    const byName = Object.fromEntries(last.map((x) => [x.placeName, x.id]));
    const [u1, u2, u3] = clients;
    // u1 은 같은 후보를 5번 연타, u2 는 마음을 바꿔 최종 cand-12, u3 는 cand-11
    for (let i = 0; i < 5; i++)
      u1.socket.emit('vote-location', { candidateId: byName['cand-12'] });
    u2.socket.emit('vote-location', { candidateId: byName['cand-13'] });
    u3.socket.emit('vote-location', { candidateId: byName['cand-11'] });
    u2.socket.emit('vote-location', { candidateId: byName['cand-12'] });
    await sleep(500);
    for (const c of clients.slice(0, 3)) {
      const ups = c.of('location-vote-updated') as Array<{
        voteState: Record<string, string[]>;
      }>;
      expect(ups).toHaveLength(8); // 방 전체 전파, 발신자 포함
      const vs = ups[ups.length - 1].voteState;
      expect(vs[byName['cand-12']].sort()).toEqual(['11', '12']);
      expect(vs[byName['cand-11']]).toEqual(['13']);
      expect(vs[byName['cand-13']]).toEqual([]);
    }
    const since = Date.now();
    clients
      .slice(0, 3)
      .forEach((c) => c.socket.emit('ready-state', { isReady: true }));
    const fin = await u3.waitFor<{ finalState: { location?: Cand } }>(
      'final-state-response',
      (p) => !!p?.finalState?.location,
      5000,
      since,
    );
    expect(fin.finalState.location!.id).toBe(byName['cand-12']);
  });

  it('(e) 같은 시드(두 큐로 2회 소비된 완료 이벤트·입장 API)가 동시에·나중에 와도 방은 하나, 진행은 유지', async () => {
    const roomId = `${Date.now() % 100000}5`;
    const booted = await bootApp(0, snapshotOverride());
    app = booted.app;
    const statuses = await Promise.all([
      seedAnnouncement(booted.port, roomId, users),
      seedAnnouncement(booted.port, roomId, users),
    ]);
    expect(statuses).toEqual([201, 201]);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    clients[0].socket.emit('chat-message', { text: 'keep' });
    await allReadyAndAdvance(clients, 'location');
    await Promise.all([
      seedAnnouncement(booted.port, roomId, users),
      seedAnnouncement(booted.port, roomId, users),
    ]);
    const late = connectUser(booted.port, '12', roomId);
    clients.push(late);
    const st = await late.waitFor<{ stage: string }>('stage-changed');
    expect(st.stage).toBe('location');
    const hist = await late.waitFor<ChatMsg[]>('chat-messages');
    expect(hist.map((m) => m.text)).toEqual(['keep']);
    const parts = await late.waitFor<{ participants?: unknown[] }>(
      'initial-state-response',
      (p) => Array.isArray(p.participants),
    );
    expect(parts.participants).toHaveLength(3);
  });
});
