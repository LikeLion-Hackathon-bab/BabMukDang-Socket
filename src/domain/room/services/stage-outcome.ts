import type { RoomStore } from '../types/room.type';

/**
 * 단계를 넘기기 전에 결과가 정해졌는지 본다 (F55 동점 재투표, F60 공통 날짜·시간 없음).
 * 정해지지 않았으면 다음 단계로 가지 않고 retryStage 로 돌아가 다시 고르게 한다.
 * 기존 stage-changed 이벤트에 reason·message 필드를 더해 알린다(하위 호환).
 */
export type StageRetryReason = 'tie' | 'no-common-date' | 'no-common-time';

export interface StageRetry {
  reason: StageRetryReason;
  retryStage: string;
  message: string;
}

export const STAGE_RETRY_MESSAGES: Record<StageRetryReason, string> = {
  tie: '동점이네요. 채팅을 통해 의견 조율을 해보세요! 대화 후에 다시 한 번 투표해주세요',
  'no-common-date': '모두가 가능한 날짜가 없어요. 날짜를 다시 정할게요',
  'no-common-time': '모두가 가능한 시간대가 없어요. 날짜를 다시 정할게요',
};

/** 최다 득표가 1표 이상이고 둘 이상 후보가 같으면 동점 */
export function isTie(counts: number[]): boolean {
  const max = Math.max(0, ...counts);
  return max > 0 && counts.filter((c) => c === max).length >= 2;
}

function retry(reason: StageRetryReason, retryStage: string): StageRetry {
  return { reason, retryStage, message: STAGE_RETRY_MESSAGES[reason] };
}

export function checkStageOutcome(
  room: RoomStore | undefined,
  stage: string,
): StageRetry | undefined {
  if (!room) return undefined;
  switch (stage) {
    case 'date':
      return room.final.date ? undefined : retry('no-common-date', 'date');
    case 'time':
      return room.final.time ? undefined : retry('no-common-time', 'date');
    case 'location-vote': {
      const votes = room.location?.votes;
      if (!votes) return undefined;
      const counts = Array.from(votes.values()).map((s) => s.size);
      return isTie(counts) ? retry('tie', stage) : undefined;
    }
    case 'menu': {
      const m = room.menu;
      if (!m) return undefined;
      const counts = m.availableMenus.map(
        (menu) => m.menuPerUserSelections.get(menu.label)?.size ?? 0,
      );
      return isTie(counts) ? retry('tie', stage) : undefined;
    }
    case 'restaurant': {
      const r = room.restaurant;
      if (!r) return undefined;
      const tally = new Map<string, number>();
      r.restaurantUserList.forEach((id) =>
        tally.set(id, (tally.get(id) ?? 0) + 1),
      );
      return isTie(Array.from(tally.values()))
        ? retry('tie', stage)
        : undefined;
    }
    default:
      return undefined;
  }
}
