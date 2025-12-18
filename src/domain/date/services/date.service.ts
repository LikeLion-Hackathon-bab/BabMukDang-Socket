import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/domain/common/base.service';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { DateStore } from 'src/domain/date/types/date.type';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';

@Injectable()
export class DateService extends BaseService<DateStore> {
  private readonly logger = new Logger(DateService.name);
  constructor(readonly roomStore: RoomStoreService) {
    super(roomStore);
    const emitter = this.roomStore.getEventEmitter();
    emitter.on(
      'request-initial-state',
      ({ roomId, stage }: { roomId: string; stage: InvitationStage }) => {
        if (stage !== 'date') return;
        this.logger.log(`Initialized date state for room ${roomId}`);
        emitter.emit('initial-state-response', {
          roomId,
          stage: 'date',
          initialState: this.serialize(
            this.getStepState(roomId) ?? this.initializeStep(roomId),
          ),
        });
      },
    );
    emitter.on(
      'request-final-state',
      ({
        roomId,
        stage,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
      }) => {
        if (stage !== 'date') return;
        const finalDate = this.calculateFinalDate(roomId);
        const finalState = this.roomStore.getFinalState(roomId);
        if (!finalState) return;
        finalState.date = finalDate ?? '';
        emitter.emit('final-state-response', {
          roomId,
          finalState,
        });
      },
    );
  }

  getStepState(roomId: string): DateStore | undefined {
    const room = this.roomStore.getRoom(roomId);
    if (!room) return undefined;
    if (room.date === undefined) return undefined;
    return room.date;
  }

  updateStepState(
    roomId: string,
    updateFn: (state: DateStore) => void,
  ): DateStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) this.throwError('Room not found', roomId);
    if (room.date === undefined) {
      room.date = this.createInitialState();
    }
    updateFn(room.date);
    this.bumpVersion(roomId);
    return room.date;
  }

  validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean {
    return fromStage === 'date' && toStage === 'time';
  }

  initializeStep(roomId: string): DateStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) this.throwError('Room not found', roomId);
    const init = this.createInitialState();
    room.date = init;
    return init;
  }

  resetStep(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    if (!room) return;
    room.date = this.createInitialState();
    this.bumpVersion(roomId);
  }

  validateStepState(_roomId: string): boolean {
    void _roomId;
    // any date strings are acceptable ISO dates in this simplified version
    return true;
  }

  validateBusinessRules(
    _roomId: string,
    action: string,
    payload: unknown,
  ): boolean {
    switch (action) {
      case 'PICK_DATES': {
        if (typeof payload !== 'object' || payload === null) return false;
        const p = payload as { userId?: unknown; dates?: unknown };
        if (typeof p.userId !== 'string') return false;
        if (!Array.isArray(p.dates)) return false;
        return (p.dates as unknown[]).every(
          (d): d is string => typeof d === 'string',
        );
      }
      default:
        return false;
    }
  }

  private createInitialState(): DateStore {
    return {
      pickedByUser: new Map(),
    };
  }

  pickMany(roomId: string, userId: string, dates: string[]) {
    this.updateStepState(roomId, (state) => {
      state.pickedByUser.set(userId, Array.from(new Set(dates)));
    });
  }

  getSerialized(roomId: string) {
    const state = this.getStepState(roomId);
    return state ? this.serialize(state) : [];
  }

  private serialize(state: DateStore) {
    return Array.from(state.pickedByUser.entries()).map(([userId, dates]) => ({
      userId,
      dates,
    }));
  }

  /**
   * 모든 유저가 선택한 날짜들의 교집합 중 가장 빠른 날짜를 반환합니다.
   * 커스텀 날짜 포맷 '25. 08. 02'와 ISO 날짜 모두 지원합니다.
   */
  calculateFinalDate(roomId: string): string | undefined {
    const state = this.getStepState(roomId);
    if (!state) return undefined;
    const entries: string[][] = Array.from(state.pickedByUser.values());
    if (entries.length === 0) return undefined;

    // 교집합
    let intersection: Set<string> = new Set<string>(entries[0] ?? []);
    for (let i = 1; i < entries.length; i++) {
      const cur: Set<string> = new Set<string>(entries[i] ?? []);
      const filtered: string[] = Array.from(intersection).filter((d) =>
        cur.has(d),
      );
      intersection = new Set<string>(filtered);
      if (intersection.size === 0) break;
    }
    if (intersection.size === 0) return undefined;

    // 커스텀 날짜 포맷 파싱 ('25. 08. 02' -> timestamp)
    const parseCustomDate = (s: string): number => {
      // 형식: 'YY. MM. DD'
      const match = s.match(/^(\d{2})\.\s*(\d{2})\.\s*(\d{2})$/);
      if (match) {
        const [, yy, mm, dd] = match;
        const year = 2000 + parseInt(yy, 10);
        const month = parseInt(mm, 10) - 1;
        const day = parseInt(dd, 10);
        return new Date(year, month, day).getTime();
      }
      // ISO 날짜 fallback
      const t = Date.parse(s);
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };

    // 가장 빠른 날짜 선택
    const dates: string[] = Array.from(intersection);
    dates.sort((a: string, b: string) => {
      const ta = parseCustomDate(a);
      const tb = parseCustomDate(b);
      if (ta === Number.POSITIVE_INFINITY && tb === Number.POSITIVE_INFINITY) {
        return a.localeCompare(b);
      }
      return ta - tb;
    });
    return dates[0];
  }
}
