import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/domain/common/base.service';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { DateStore } from '../types/date.type';
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
    payload: any,
  ): boolean {
    switch (action) {
      case 'PICK_DATES':
        return (
          typeof payload.userId === 'string' &&
          Array.isArray(payload.dates) &&
          payload.dates.every((d: any) => typeof d === 'string')
        );
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
}
