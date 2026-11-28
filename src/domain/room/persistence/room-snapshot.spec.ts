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
    await expect(r.save('announcement:1', '{}')).resolves.toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(5000);
    await r.onModuleDestroy();
    await new Promise((res) => setTimeout(res, 1500));
  });
});
