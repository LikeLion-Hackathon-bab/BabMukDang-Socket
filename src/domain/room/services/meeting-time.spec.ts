import type { Server } from 'socket.io';
import { RoomHandlers } from '../gateway/room.gateway';
import { RoomStoreService } from './room.service';
import { toKstMeeting } from './meeting-time';

describe('초대방 확정 시각(KST)', () => {
  it('기준 코드 방식(toISOString)은 KST 13:00 을 04:00 으로 보내거나 화면 값에서 예외가 난다', () => {
    expect(
      new Date('2026-12-01T13:00:00+09:00').toISOString().slice(11, 16),
    ).toBe('04:00');
    expect(() => new Date('13:00–14:00').toISOString()).toThrow(RangeError);
  });

  it('화면 값(YY. MM. DD / HH:mm–HH:mm)과 ISO 시각을 KST 그대로 만든다', () => {
    expect(toKstMeeting('26. 12. 01', '13:00–14:00')).toEqual({
      meetingDate: '2026-12-01',
      meetingTime: '13:00',
    });
    expect(toKstMeeting('', '2026-12-01T04:00:00.000Z')).toEqual({
      meetingDate: '2026-12-01',
      meetingTime: '13:00',
    });
    expect(toKstMeeting('2026-12-31', '2026-12-31T15:30:00Z')).toEqual({
      meetingDate: '2026-12-31',
      meetingTime: '00:30',
    });
    expect(toKstMeeting('', '')).toEqual({ meetingDate: '', meetingTime: '' });
  });

  it('finish 에서 Spring 으로 KST 날짜·시간과 작성자 이름을 보낸다', () => {
    const logger = { log: () => {}, error: jest.fn() } as never;
    const store = new RoomStoreService(logger, {} as never);
    store.seedFromInvitation('invitation:3', {
      invitationId: '3',
      participants: [
        { userId: '1', username: '친구1', userProfileImageURL: '' },
        { userId: '2', username: '친구2', userProfileImageURL: '' },
      ],
      recentMenu: [],
    } as never);
    store.setStage('invitation:3', 'finish');
    Object.assign(store.getFinalState('invitation:3')!, {
      date: '26. 12. 01',
      time: '13:00–14:00',
      location: { placeName: '검증로' },
    });
    const post = jest.fn().mockResolvedValue({ ok: true });
    const handlers = new RoomHandlers(logger, store, {
      postInvitationResult: post,
    } as never);
    handlers.handleAutoProgressInvitation({
      to: () => ({ emit: () => {} }),
    } as unknown as Server);
    store.getEventEmitter().emit('ready-state-completed', {
      roomId: 'invitation:3',
      stage: 'finish',
    });
    expect(post).toHaveBeenCalledWith('invitation:3', {
      location: '검증로',
      meetingDate: '2026-12-01',
      meetingTime: '13:00',
      author: { name: '친구1' },
    });
  });
});
