import { Id } from '../types';

/**
 * Map/Set 직렬화 유틸리티
 * WebSocket은 Map/Set을 JSON으로 직렬화할 수 없으므로 변환 필요
 */

/**
 * Map<K, V>를 배열로 직렬화
 */
export function serializeMap<K, V>(map: Map<K, V>): { key: K; value: V }[] {
  return Array.from(map.entries()).map(([key, value]) => ({
    key,
    value,
  }));
}

/**
 * Map<K, V>를 [key, value][] 튜플 배열로 직렬화
 */
export function serializeMapToEntries<K, V>(map: Map<K, V>): [K, V][] {
  return Array.from(map.entries());
}

/**
 * Map<K, V>를 Record<string, V>로 직렬화 (key가 string인 경우)
 */
export function serializeMapToRecord<V>(
  map: Map<string, V>,
): Record<string, V> {
  return Object.fromEntries(map.entries());
}

/**
 * Set<T>를 배열로 직렬화
 */
export function serializeSet<T>(set: Set<T>): T[] {
  return Array.from(set);
}

/**
 * Map<Id, Set<Id>>를 Record<Id, Id[]>로 직렬화 (votes 패턴)
 */
export function serializeVotes(votes: Map<Id, Set<Id>>): Record<Id, Id[]> {
  const result: Record<Id, Id[]> = {};
  votes.forEach((userSet, candidateId) => {
    result[candidateId] = Array.from(userSet);
  });
  return result;
}

/**
 * Map<Id, T[]>를 { userId: Id, items: T[] }[] 배열로 직렬화 (user selection 패턴)
 */
export function serializeUserSelections<T>(
  selections: Map<Id, T[]>,
): { userId: Id; items: T[] }[] {
  return Array.from(selections.entries()).map(([userId, items]) => ({
    userId,
    items,
  }));
}

/**
 * Map<Id, Set<Id>>를 { itemId: Id, selectedUsers: Id[] }[] 배열로 직렬화 (item-user 패턴)
 */
export function serializeItemUserSelections(
  selections: Map<Id, Set<Id>>,
): { itemId: Id; selectedUsers: Id[] }[] {
  return Array.from(selections.entries()).map(([itemId, users]) => ({
    itemId,
    selectedUsers: Array.from(users),
  }));
}
