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

  validateBusinessRules(roomId: string, action: string, payload: any): boolean {
    switch (action) {
      case 'PICK_TIMES': {
        if (typeof payload?.userId !== 'string') return false;
        const timesUnknown: unknown = payload?.times;
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
}
