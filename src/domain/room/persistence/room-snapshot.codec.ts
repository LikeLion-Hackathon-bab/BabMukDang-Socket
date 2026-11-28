import type { RoomStore } from '../types/room.type';

/**
 * 방 상태 스냅샷 직렬화.
 * RoomStore 는 Map/Set 을 여러 겹 담고 있어 JSON 으로 그대로 저장되지 않는다.
 * Map·Set 을 표식 객체로 바꿔 저장하고, 읽을 때 되돌린다.
 * timeout(타이머 핸들)은 프로세스에 묶인 값이라 저장하지 않는다.
 */
export const ROOM_SNAPSHOT_VERSION = 1;

type Tagged = { __map: [unknown, unknown][] } | { __set: unknown[] };

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return { __map: Array.from(value.entries()) };
  if (value instanceof Set) return { __set: Array.from(value.values()) };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Partial<Tagged> & Record<string, unknown>;
    if ('__map' in v && Array.isArray(v.__map)) return new Map(v.__map);
    if ('__set' in v && Array.isArray(v.__set)) return new Set(v.__set);
  }
  return value;
}

export function serializeRoom(room: RoomStore): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timeout, ...rest } = room;
  return JSON.stringify({ v: ROOM_SNAPSHOT_VERSION, room: rest }, replacer);
}

/** 형식이 다르거나 깨진 스냅샷이면 undefined (예전 상태로 시작하지 않고 버린다) */
export function deserializeRoom(json: string): RoomStore | undefined {
  try {
    const parsed = JSON.parse(json, reviver) as {
      v?: number;
      room?: RoomStore;
    };
    if (parsed?.v !== ROOM_SNAPSHOT_VERSION || !parsed.room?.roomId)
      return undefined;
    const room = parsed.room;
    if (!(room.participants instanceof Map)) return undefined;
    room.timeout = undefined;
    if (!(room.recentMenu instanceof Map)) room.recentMenu = new Map();
    room.chat = Array.isArray(room.chat) ? room.chat : [];
    return room;
  } catch {
    return undefined;
  }
}
