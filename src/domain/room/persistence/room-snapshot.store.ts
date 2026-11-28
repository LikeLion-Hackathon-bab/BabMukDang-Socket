import { Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const ROOM_SNAPSHOT_STORE = 'ROOM_SNAPSHOT_STORE';

/** 방 상태 스냅샷 저장소. 키는 roomId(예: announcement:12) */
export interface RoomSnapshotStore {
  readonly enabled: boolean;
  loadAll(roomIdPrefix: string): Promise<Array<[string, string]>>;
  save(roomId: string, json: string): Promise<void>;
  remove(roomId: string): Promise<void>;
}

/** REDIS_URL 이 없을 때: 지금까지처럼 메모리에만 둔다 */
export class NoopRoomSnapshotStore implements RoomSnapshotStore {
  readonly enabled = false;
  loadAll() {
    return Promise.resolve([] as Array<[string, string]>);
  }
  save() {
    return Promise.resolve();
  }
  remove() {
    return Promise.resolve();
  }
}

/** 시험용: 앱 인스턴스를 바꿔도 살아남는 외부 저장소 대역 */
export class MemoryRoomSnapshotStore implements RoomSnapshotStore {
  readonly enabled = true;
  readonly data = new Map<string, string>();
  loadAll(prefix: string) {
    return Promise.resolve(
      Array.from(this.data.entries()).filter(([k]) => k.startsWith(prefix)),
    );
  }
  save(roomId: string, json: string) {
    this.data.set(roomId, json);
    return Promise.resolve();
  }
  remove(roomId: string) {
    this.data.delete(roomId);
    return Promise.resolve();
  }
}

export interface RedisSnapshotOptions {
  url: string;
  keyPrefix: string;
  ttlSeconds: number;
  loadTimeoutMs: number;
}

/**
 * Redis 스냅샷 저장소. Spring 과 같은 Redis 를 쓰므로 키 접두사로 구분한다.
 * Redis 가 죽어 있어도 방 진행은 막지 않는다(경고만 남기고 메모리로 계속).
 */
export class RedisRoomSnapshotStore
  implements RoomSnapshotStore, OnModuleDestroy
{
  readonly enabled = true;
  private readonly logger = new Logger(RedisRoomSnapshotStore.name);
  private readonly redis: Redis;
  private lastErrorLog = 0;

  constructor(private readonly opts: RedisSnapshotOptions) {
    this.redis = new Redis(opts.url, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      // 끊긴 동안 쓰기를 쌓아 두지 않는다(다음 변경 때 최신 상태를 다시 쓴다)
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.redis.on('error', (e: Error) => this.warn(`redis: ${e.message}`));
  }

  private warn(msg: string) {
    const now = Date.now();
    if (now - this.lastErrorLog < 10_000) return;
    this.lastErrorLog = now;
    this.logger.warn(msg);
  }

  private key(roomId: string) {
    return this.opts.keyPrefix + roomId;
  }

  private connecting?: Promise<void>;
  private async ready(): Promise<void> {
    if (this.redis.status === 'wait')
      this.connecting ??= this.redis.connect().finally(() => {
        this.connecting = undefined;
      });
    if (this.connecting) await this.connecting;
  }

  async loadAll(roomIdPrefix: string): Promise<Array<[string, string]>> {
    const work = (async () => {
      await this.ready();
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await this.redis.scan(
          cursor,
          'MATCH',
          this.key(roomIdPrefix) + '*',
          'COUNT',
          200,
        );
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0');
      if (keys.length === 0) return [];
      const values = await this.redis.mget(...keys);
      const out: Array<[string, string]> = [];
      keys.forEach((k, i) => {
        const v = values[i];
        if (v) out.push([k.slice(this.opts.keyPrefix.length), v]);
      });
      return out;
    })();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('timeout')),
        this.opts.loadTimeoutMs,
      );
    });
    try {
      return await Promise.race([work, timeout]);
    } catch (e) {
      this.logger.warn(
        `방 상태 복원 실패, 빈 상태로 시작: ${(e as Error).message}`,
      );
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async save(roomId: string, json: string): Promise<void> {
    try {
      await this.ready();
      await this.redis.set(this.key(roomId), json, 'EX', this.opts.ttlSeconds);
    } catch (e) {
      this.warn(`방 상태 저장 실패(${roomId}): ${(e as Error).message}`);
    }
  }

  async remove(roomId: string): Promise<void> {
    try {
      await this.ready();
      await this.redis.del(this.key(roomId));
    } catch (e) {
      this.warn(`방 상태 삭제 실패(${roomId}): ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.redis.status !== 'ready') {
      this.redis.disconnect(); // 재연결 시도 중이면 즉시 끊는다
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

export function createRoomSnapshotStore(
  env: NodeJS.ProcessEnv = process.env,
): RoomSnapshotStore {
  const url = env.REDIS_URL?.trim();
  if (!url) return new NoopRoomSnapshotStore();
  return new RedisRoomSnapshotStore({
    url,
    keyPrefix: env.ROOM_SNAPSHOT_PREFIX ?? 'babmukdang:socket:room:',
    ttlSeconds: Number(env.ROOM_SNAPSHOT_TTL_SECONDS) || 3 * 24 * 3600,
    loadTimeoutMs: Number(env.ROOM_SNAPSHOT_LOAD_TIMEOUT_MS) || 3000,
  });
}
