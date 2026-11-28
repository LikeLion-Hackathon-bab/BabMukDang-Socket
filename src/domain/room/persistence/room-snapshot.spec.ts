import { RoomStoreService } from '../services/room.service';
import { deserializeRoom, serializeRoom } from './room-snapshot.codec';
import {
  createRoomSnapshotStore,
  MemoryRoomSnapshotStore,
  NoopRoomSnapshotStore,
  RedisRoomSnapshotStore,
} from './room-snapshot.store';

const logger = { log: () => {}, error: () => {}, warn: () => {} } as never;
const flush = () => new Promise<void>((r) => setImmediate(r));

function makeStore(snap: MemoryRoomSnapshotStore, invitation = false) {
  const s = new RoomStoreService(logger, {} as never, snap);
  s.isInvitation = invitation;
  return s;
}

describe('방 상태 스냅샷', () => {
  it('Map·Set 이 여러 겹인 방 상태를 그대로 왕복한다(타이머 제외)', () => {
    const store = makeStore(new MemoryRoomSnapshotStore());
    store.seedFromAnnouncement('announcement:1', {
      announcementId: '1',
      location: '마포',
      meetingAt: '2026-12-01T12:00',
      participants: [
        { userId: 'a', userName: 'A', userProfileImageURL: '' },
      ] as never,
      recentMenu: [
        { userId: 'a', menu: [{ code: 'm1', label: '국밥' }] },
      ] as never,
    });
    const room = store.getRoom('announcement:1')!;
    room.stage = 'location-vote';
    room.location = {
      candidates: new Map([
        ['c1', { id: 'c1', placeName: 'p', lat: 1, lng: 2, address: 'x' }],
      ]),
      votes: new Map([['c1', new Set(['a'])]]),
      maxCandidates: 20,
    };
    room.excludeMenu = {
      userExclusions: new Map([
        ['a', new Map([['m1', { code: 'm1', label: '국밥' }]])],
      ]),
      maxExclusionsPerUser: 3,
    };
    room.chat.push({
      messageId: 'msg_1',
      roomId: room.roomId,
      user: { userId: 'a' },
      text: 'hi',
      createdAt: 'now',
    });
    room.final.location = room.location.candidates.get('c1');
    room.timeout = setTimeout(() => {}, 1);
    const back = deserializeRoom(serializeRoom(room))!;
    clearTimeout(room.timeout);
    expect(back.timeout).toBeUndefined();
    expect(back.location!.votes.get('c1')).toEqual(new Set(['a']));
    expect(back.excludeMenu!.userExclusions.get('a')!.get('m1')!.label).toBe(
      '국밥',
    );
    expect(back.recentMenu.get('a')).toEqual([{ code: 'm1', label: '국밥' }]);
    expect(back.participants.get('a')!.username).toBe('A');
    expect(back.chat).toHaveLength(1);
    expect(back.final.location!.id).toBe('c1');
    expect(back.stage).toBe('location-vote');
  });

  it('깨졌거나 버전이 다른 스냅샷은 버린다', () => {
    expect(deserializeRoom('{')).toBeUndefined();
    expect(deserializeRoom('{"v":99,"room":{"roomId":"x"}}')).toBeUndefined();
  });

  it('변경은 저장되고, 새 인스턴스는 자기 네임스페이스 방만 되살리며 준비 상태를 푼다', async () => {
    const snap = new MemoryRoomSnapshotStore();
    const a = makeStore(snap);
    a.seedFromAnnouncement('announcement:5', {
      participants: [{ userId: 'u', userName: 'U' }],
      recentMenu: [],
    } as never);
    a.updateParticipantReadyState('announcement:5', 'u', true);
    a.addChatMessage('announcement:5', {
      messageId: 'm',
      roomId: 'announcement:5',
      user: { userId: 'u' },
      createdAt: 'x',
    });
    await flush();
    await a.onModuleDestroy();
    expect(Array.from(snap.data.keys())).toEqual(['announcement:5']);

    const b = makeStore(snap);
    const inv = makeStore(snap, true);
    await b.onApplicationBootstrap();
    await inv.onApplicationBootstrap();
    expect(b.getChatMessages('announcement:5')).toHaveLength(1);
    expect(b.getParticipantReadyCount('announcement:5')).toBe(0);
    expect(inv.getRoom('announcement:5')).toBeUndefined();
    // 재전달된 시드가 복원된 방을 덮지 않는다
    b.seedFromAnnouncement('announcement:5', {
      participants: [],
      recentMenu: [],
    } as never);
    expect(b.getChatMessages('announcement:5')).toHaveLength(1);

    b.deleteRoom('announcement:5');
    await flush();
    expect(snap.data.size).toBe(0);
  });

  it('다시 온 시드는 진행 상태를 유지하고 빠진 참가자만 더한다(커밋 전 발행된 완료 이벤트)', () => {
    const s = makeStore(new MemoryRoomSnapshotStore());
    const seed = (ids: string[]) =>
      s.seedFromAnnouncement('announcement:9', {
        announcementId: '9',
        location: 'x',
        meetingAt: 'y',
        participants: ids.map((u) => ({ userId: u, userName: 'n' + u })),
        recentMenu: ids.map((u) => ({ userId: u, menu: [] })),
      } as never);
    seed(['1', '2']);
    s.setStage('announcement:9', 'location');
    s.updateParticipantReadyState('announcement:9', '1', true);
    seed(['1', '2', '3']);
    const room = s.getRoom('announcement:9')!;
    if (room.timeout) clearTimeout(room.timeout);
    expect(Array.from(room.participants.keys())).toEqual(['1', '2', '3']);
    expect(room.participants.get('3')!.username).toBe('n3');
    expect(room.participants.get('1')!.ready).toBe(true);
    expect(room.stage).toBe('location');
    expect(s.canJoin('announcement:9', '3')).toBe(true);
  });

  it('REDIS_URL 이 없으면 저장하지 않는다(기존 동작)', () => {
    expect(createRoomSnapshotStore({})).toBeInstanceOf(NoopRoomSnapshotStore);
    expect(
      createRoomSnapshotStore({ REDIS_URL: 'redis://127.0.0.1:1' }),
    ).toBeInstanceOf(RedisRoomSnapshotStore);
  });

  it('Redis 가 죽어 있어도 시작·저장이 멈추거나 throw 하지 않는다', async () => {
    const r = new RedisRoomSnapshotStore({
      url: 'redis://127.0.0.1:1',
      keyPrefix: 't:',
      ttlSeconds: 10,
      loadTimeoutMs: 500,
    });
    const t0 = Date.now();
    await expect(r.loadAll('announcement:')).resolves.toEqual([]);
    await expect(r.save('announcement:1', '{}')).resolves.toBe(false);
    await expect(r.remove('announcement:1')).resolves.toBe(false);
    expect(Date.now() - t0).toBeLessThan(5000);
    await r.onModuleDestroy();
    await new Promise((res) => setTimeout(res, 1500));
  });
  const seed = (s: RoomStoreService, id: string, users: string[]) =>
    s.seedFromAnnouncement(id, {
      participants: users.map((u) => ({ userId: u, userName: u })),
      recentMenu: [],
    } as never);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('S3: Redis 삭제가 실패하면 다시 시도해 지운 방이 재시작 뒤 되살아나지 않는다', async () => {
    const snap = new MemoryRoomSnapshotStore();
    const a = makeStore(snap);
    a.snapshotRetryMs = 20;
    seed(a, 'announcement:31', ['1', '2']);
    await flush();
    expect(snap.data.has('announcement:31')).toBe(true);
    snap.failRemoves = 1;
    a.deleteRoom('announcement:31');
    await flush();
    expect(snap.data.has('announcement:31')).toBe(true);
    await wait(80);
    expect(snap.data.has('announcement:31')).toBe(false);
    const b = makeStore(snap);
    await b.onApplicationBootstrap();
    expect(b.getRoom('announcement:31')).toBeUndefined();
    await a.onModuleDestroy();
  });

  it('S3: 메모리에 방이 없어도 dissolve 나가기는 스냅샷을 지운다', async () => {
    const snap = new MemoryRoomSnapshotStore();
    snap.data.set('announcement:32', 'stale');
    const a = makeStore(snap);
    expect(a.leaveRoom('announcement:32', '2', true)).toBe('noop');
    await flush();
    expect(snap.data.has('announcement:32')).toBe(false);
    // dissolve 가 아니면 다른 사람의 진행을 지우지 않는다(권위 시드가 명단을 바로잡는다)
    snap.data.set('announcement:33', 'kept');
    expect(a.leaveRoom('announcement:33', '2', false)).toBe('noop');
    await flush();
    expect(snap.data.get('announcement:33')).toBe('kept');
  });

  it('S3: finish 단계 스냅샷은 되살리지 않고 지운다', async () => {
    const snap = new MemoryRoomSnapshotStore();
    const a = makeStore(snap);
    seed(a, 'announcement:34', ['1']);
    a.setStage('announcement:34', 'finish');
    await flush();
    expect(snap.data.has('announcement:34')).toBe(true);
    const b = makeStore(snap);
    await b.onApplicationBootstrap();
    await flush();
    expect(b.getRoom('announcement:34')).toBeUndefined();
    expect(snap.data.has('announcement:34')).toBe(false);
  });

  it('S3: 옛 방 삭제가 밀린 사이 같은 id 로 새 방이 생기면 새 방 스냅샷을 지우지 않는다', async () => {
    const snap = new MemoryRoomSnapshotStore();
    const a = makeStore(snap);
    a.snapshotRetryMs = 20;
    seed(a, 'announcement:35', ['1', '2']);
    await flush();
    snap.failRemoves = 1;
    a.deleteRoom('announcement:35');
    await flush();
    seed(a, 'announcement:35', ['1']);
    await flush();
    await wait(80);
    expect(snap.data.has('announcement:35')).toBe(true);
    expect(deserializeRoom(snap.data.get('announcement:35')!)?.stage).toBe(
      'waiting',
    );
    await a.onModuleDestroy();
  });

  it('S8: 스냅샷 저장이 실패하면 다음 변경이 없어도 다시 쓴다', async () => {
    const snap = new MemoryRoomSnapshotStore();
    const a = makeStore(snap);
    a.snapshotRetryMs = 20;
    seed(a, 'announcement:36', ['1']);
    await flush();
    snap.failSaves = 1;
    a.setStage('announcement:36', 'location');
    await flush();
    expect(deserializeRoom(snap.data.get('announcement:36')!)?.stage).toBe(
      'waiting',
    );
    await wait(80);
    expect(deserializeRoom(snap.data.get('announcement:36')!)?.stage).toBe(
      'location',
    );
    await a.onModuleDestroy();
  });
});
