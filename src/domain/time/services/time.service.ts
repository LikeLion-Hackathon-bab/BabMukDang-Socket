import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/domain/common/base.service';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { TimeStore } from '../types/time.type';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';

@Injectable()
export class TimeService extends BaseService<TimeStore> {
  private readonly logger = new Logger(TimeService.name);
  constructor(readonly roomStore: RoomStoreService) {
    super(roomStore);
    const emitter = this.roomStore.getEventEmitter();
    emitter.on(
      'request-initial-state',
      ({ roomId, stage }: { roomId: string; stage: InvitationStage }) => {
        if (stage !== 'time') return;
        this.logger.log(`Initialized time state for room ${roomId}`);
        emitter.emit('initial-state-response', {
          roomId,
          stage: 'time',
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
        if (stage !== 'time') return;
        const finalTime = this.calculateFinalTime(roomId);
        const finalState = this.roomStore.getFinalState(roomId);
        if (!finalState) return;
        finalState.time = finalTime ?? '';
        emitter.emit('final-state-response', {
          roomId,
          finalState,
        });
      },
    );
  }

  getStepState(roomId: string): TimeStore | undefined {
    const room = this.roomStore.getRoom(roomId);
    if (!room) return undefined;
    if (room.time === undefined) return undefined;
    return room.time;
  }

  updateStepState(
    roomId: string,
    updateFn: (state: TimeStore) => void,
  ): TimeStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) this.throwError('Room not found', roomId);
    if (room.time === undefined) {
      room.time = this.createInitialState();
    }
    updateFn(room.time);
    this.bumpVersion(roomId);
    return room.time;
  }

  validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean {
    return fromStage === 'time' && toStage === 'location';
  }

  initializeStep(roomId: string): TimeStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) this.throwError('Room not found', roomId);
    const init = this.createInitialState();
    room.time = init;
    return init;
  }

  resetStep(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    if (!room) return;
    room.time = this.createInitialState();
    this.bumpVersion(roomId);
  }

  validateStepState(_roomId: string): boolean {
    void _roomId;
    return true;
  }

  validateBusinessRules(
    roomId: string,
    action: string,
    payload: unknown,
  ): boolean {
    switch (action) {
      case 'PICK_TIMES': {
        if (typeof payload !== 'object' || payload === null) return false;
        const p = payload as { userId?: unknown; times?: unknown };
        if (typeof p.userId !== 'string') return false;
        const timesUnknown: unknown = p.times;
        if (!Array.isArray(timesUnknown)) return false;
        return (timesUnknown as unknown[]).every(
          (t): t is string => typeof t === 'string',
        );
      }
      default:
        return false;
    }
  }

  private createInitialState(): TimeStore {
    return {
      pickedByUser: new Map(),
    };
  }

  pickMany(roomId: string, userId: string, times: string[]) {
    this.updateStepState(roomId, (state) => {
      state.pickedByUser.set(userId, Array.from(new Set(times)));
    });
  }

  getSerialized(roomId: string) {
    const state = this.getStepState(roomId);
    return state ? this.serialize(state) : [];
  }

  private serialize(state: TimeStore) {
    return Array.from(state.pickedByUser.entries()).map(([userId, times]) => ({
      userId,
      times,
    }));
  }

  /**
   * 모든 유저가 선택한 시간 구간의 교집합 중 가장 이른 시작 시간을 반환합니다.
   * 시간 형식: 'HH:mm–HH:mm'.
   */
  calculateFinalTime(roomId: string): string | undefined {
    const state = this.getStepState(roomId);
    if (!state) return undefined;
    const allRanges = Array.from(state.pickedByUser.values());
    if (allRanges.length === 0) return undefined;

    // 유저별 문자열 배열을 [startMin, endMin][]로 파싱
    const parseRange = (r: string): [number, number] | null => {
      const [s, e] = r.split('–');
      if (!s || !e) return null;
      const [sh, sm] = s.split(':').map((v) => parseInt(v, 10));
      const [eh, em] = e.split(':').map((v) => parseInt(v, 10));
      if (
        Number.isNaN(sh) ||
        Number.isNaN(sm) ||
        Number.isNaN(eh) ||
        Number.isNaN(em)
      )
        return null;
      return [sh * 60 + sm, eh * 60 + em];
    };

    const parsedByUser: [number, number][][] = allRanges.map((arr) =>
      (arr ?? [])
        .map(parseRange)
        .filter((x): x is [number, number] => !!x)
        .sort((a, b) => a[0] - b[0]),
    );

    // 교집합 구하기: 모든 유저의 구간과 겹치는 가장 이른 시작 시각이 포함된 구간
    // 간단화: 모든 구간의 시작 최대값과 종료 최소값을 비교
    let startMax = 0;
    let endMin = 24 * 60; // 하루 기준
    for (const ranges of parsedByUser) {
      if (ranges.length === 0) return undefined;
      const localStartMin = Math.min(...ranges.map((r) => r[0]));
      const localEndMax = Math.max(...ranges.map((r) => r[1]));
      // 시작은 전원 가능한 시간대의 최대 시작, 종료는 전원 가능한 시간대의 최소 종료를 유지
      startMax = Math.max(startMax, localStartMin);
      endMin = Math.min(endMin, localEndMax);
    }
    if (startMax >= endMin) return undefined;

    const hh = String(Math.floor(startMax / 60)).padStart(2, '0');
    const mm = String(startMax % 60).padStart(2, '0');
    const eeH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const eeM = String(endMin % 60).padStart(2, '0');
    return `${hh}:${mm}–${eeH}:${eeM}`;
  }
}
