/** contracts/participation-cancel.md §3: Spring → Socket 나가기 알림 */
import type { INestApplication } from '@nestjs/common';
import {
  allReadyAndAdvance,
  bootApp,
  connected,
  connectUser,
  QA_ENV,
  type QaClient,
  seedAnnouncement,
  sleep,
} from './harness';
import {
  MemoryRoomSnapshotStore,
  ROOM_SNAPSHOT_STORE,
} from '../persistence/room-snapshot.store';

jest.setTimeout(40_000);

async function leave(
  port: number,
  ns: string,
  id: string,
  body: unknown,
  key = QA_ENV.ROOM_RESULT_KEY,
) {
  const res = await fetch(`http://127.0.0.1:${port}/api/${ns}/${id}/leave`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Room-Key': key },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as unknown,
  };
}

describe('참여 취소 알림', () => {
  const users = ['11', '12', '13'];
  let app: INestApplication | undefined;
  let clients: QaClient[] = [];
  const snap = new MemoryRoomSnapshotStore();
  afterEach(async () => {
    clients.forEach((c) => c.close());
    clients = [];
    if (app) await app.close();
    app = undefined;
  });
  const boot = () =>
    bootApp(0, (b) => b.overrideProvider(ROOM_SNAPSHOT_STORE).useValue(snap));

  it('dissolve=false: 나간 사람은 끊기고, 남은 사람은 2명 명단·준비 0을 받고 계속 진행한다', async () => {
    const booted = await boot();
    app = booted.app;
    const roomId = `${Date.now() % 100000}7`;
    await seedAnnouncement(booted.port, roomId, users);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    await allReadyAndAdvance(clients, 'location');
    const [a, b, c] = clients;
    a.socket.emit('ready-state', { isReady: true });
    await sleep(100);
    const since = Date.now();
    const r = await leave(booted.port, 'announcement', roomId, {
      userId: 13,
      dissolve: false,
    });
    expect(r).toEqual({ status: 200, body: { result: 'left' } });
    await c.waitFor('room-left', () => true, 3000, since);
    await sleep(200);
    expect(c.socket.connected).toBe(false);
    for (const x of [a, b]) {
      const st = await x.waitFor<{ participants?: Array<{ userId: string }> }>(
        'initial-state-response',
        (p) => Array.isArray(p.participants),
        3000,
        since,
      );
      expect(st.participants!.map((p) => p.userId)).toEqual(['11', '12']);
      const rs = await x.waitFor<{
        readyCount: number;
        participantCount: number;
      }>('ready-state-changed', () => true, 3000, since);
      expect(rs).toEqual({ readyCount: 0, participantCount: 2 });
    }
    // 나간 사람은 다시 들어올 수 없다
    const back = connectUser(booted.port, '13', roomId);
    clients.push(back);
    await sleep(500);
    expect(back.errors).toContain('Forbidden: not a room member');
    // 남은 두 명만으로 진행
    await allReadyAndAdvance([a, b], 'location-vote');
    // 같은 알림 재전송은 멱등
    expect(
      (
        await leave(booted.port, 'announcement', roomId, {
          userId: '13',
          dissolve: false,
        })
      ).body,
    ).toEqual({ result: 'noop' });
  });

  it('dissolve=true: 해산 알림 후 끊고 방·스냅샷 삭제, 다시 시드가 오면 새 방(waiting)', async () => {
    const booted = await boot();
    app = booted.app;
    const roomId = `${Date.now() % 100000}8`;
    await seedAnnouncement(booted.port, roomId, users);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    clients[0].socket.emit('chat-message', { text: 'old' });
    await allReadyAndAdvance(clients, 'location');
    await sleep(100);
    expect(snap.data.has(`announcement:${roomId}`)).toBe(true);
    const since = Date.now();
    const r = await leave(booted.port, 'announcement', roomId, {
      userId: '12',
      dissolve: true,
    });
    expect(r.body).toEqual({ result: 'dissolved' });
    for (const c of clients) {
      const d = await c.waitFor<{
        roomId: string;
        reason: string;
        message: string;
      }>('room-dissolved', () => true, 3000, since);
      expect(d).toMatchObject({ roomId, reason: 'participant-left' });
    }
    await sleep(300);
    expect(clients.every((c) => !c.socket.connected)).toBe(true);
    await sleep(50);
    expect(snap.data.has(`announcement:${roomId}`)).toBe(false);
    expect(
      (
        await leave(booted.port, 'announcement', roomId, {
          userId: '12',
          dissolve: true,
        })
      ).body,
    ).toEqual({ result: 'noop' });
    // 다시 모집 → 다시 마감: 새 명단으로 새 방
    expect(await seedAnnouncement(booted.port, roomId, ['11', '13'])).toBe(201);
    const fresh = connectUser(booted.port, '13', roomId);
    clients.push(fresh);
    expect(
      (await fresh.waitFor<{ stage: string }>('stage-changed')).stage,
    ).toBe('waiting');
    expect(await fresh.waitFor<unknown[]>('chat-messages')).toEqual([]);
    const denied = connectUser(booted.port, '12', roomId);
    clients.push(denied);
    await sleep(500);
    expect(denied.errors).toContain('Forbidden: not a room member');
  });

  it('S2: 나가기 알림이 유실돼도 재시작 뒤 권위 시드(입장 API)가 나간 사람을 뺀다', async () => {
    let booted = await boot();
    app = booted.app;
    const roomId = `${Date.now() % 100000}9`;
    await seedAnnouncement(booted.port, roomId, users);
    clients = users.map((u) => connectUser(booted.port, u, roomId));
    await Promise.all(clients.map((c) => connected(c)));
    await allReadyAndAdvance(clients, 'location');
    await sleep(100);
    clients.forEach((c) => c.close());
    clients = [];
    await app.close();
    // 13 이 나갔지만 알림이 유실됐다. 재시작하면 스냅샷이 13 을 되살린다
    booted = await boot();
    app = booted.app;
    // 이벤트 경로(권위 없음) 시드는 더하기만 한다
    await seedAnnouncement(booted.port, roomId, ['11', '12']);
    const stale = connectUser(booted.port, '13', roomId);
    clients.push(stale);
    await connected(stale);
    // 입장 API 시드는 정답 명단이다
    await seedAnnouncement(booted.port, roomId, ['11', '12'], {
      authoritative: true,
    });
    await stale.waitFor('room-left');
    const a = connectUser(booted.port, '11', roomId);
    const b = connectUser(booted.port, '12', roomId);
    clients.push(a, b);
    await Promise.all([a, b].map((x) => connected(x)));
    const init = await a.waitFor<{ participants?: { userId: string }[] }>(
      'initial-state-response',
      (p) => Array.isArray(p.participants),
    );
    expect(init.participants!.map((p) => p.userId).sort()).toEqual([
      '11',
      '12',
    ]);
    // 2명만 준비해도 다음 단계로 간다
    await allReadyAndAdvance([a, b], 'location-vote');
    const again = connectUser(booted.port, '13', roomId);
    clients.push(again);
    await sleep(500);
    expect(again.errors).toContain('Forbidden: not a room member');
  });

  it('키 없거나 틀리면 403, userId 없으면 400', async () => {
    const booted = await boot();
    app = booted.app;
    expect(
      (await leave(booted.port, 'invitation', '1', { userId: '1' }, 'wrong'))
        .status,
    ).toBe(403);
    expect(
      (await leave(booted.port, 'invitation', '1', { dissolve: true })).status,
    ).toBe(400);
    expect(
      (
        await leave(booted.port, 'invitation', '1', {
          userId: '1',
          dissolve: true,
        })
      ).body,
    ).toEqual({ result: 'noop' });
  });
});
