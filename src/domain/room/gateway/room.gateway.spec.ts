import { EventEmitter } from 'events';
import type { Server } from 'socket.io';
import { RoomHandlers } from './room.gateway';

describe('announcement restaurant confirmation', () => {
  function setup() {
    const emitter = new EventEmitter();
    const room = {
      getEventEmitter: () => emitter,
      getFinalState: () => ({ restaurant: { name: '초밥집' } }),
      resetParticipantsReadyState: jest.fn(),
      getParticipantReadyCount: () => 0,
      getParticipantCount: () => 3,
      getParticipants: () => new Map(),
      setStage: jest.fn(),
      getStage: () => 'restaurant',
      getRoom: () => undefined,
      beginTransition: () => true,
      endTransition: jest.fn(),
      deleteRoom: jest.fn(),
    };
    const save = jest.fn();
    const emit = jest.fn();
    const handlers = new RoomHandlers(
      { log: jest.fn(), error: jest.fn() } as never,
      room as never,
      { saveConfirmedRestaurant: save } as never,
    );
    handlers.handleAutoProgressAnnouncement({
      to: () => ({ emit }),
    } as unknown as Server);
    return {
      room,
      save,
      emit,
      finish: async () => {
        emitter.emit('ready-state-completed', {
          roomId: 'announcement:12',
          stage: 'restaurant',
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
      },
    };
  }
  it('acknowledges storage before displaying finish', async () => {
    const { save, room, finish } = setup();
    save.mockResolvedValue(undefined);
    await finish();
    expect(save).toHaveBeenCalledWith('12', '초밥집');
    expect(room.setStage).toHaveBeenCalledWith('announcement:12', 'finish');
  });
  it('keeps the voting room available after a failed write', async () => {
    const { save, room, emit, finish } = setup();
    save.mockRejectedValue(new Error('offline'));
    await finish();
    expect(room.setStage).not.toHaveBeenCalled();
    expect(room.deleteRoom).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('meeting-save-failed');
  });
});
