import {
  fromOffsetDateTime,
  toKstMeeting,
  toKstOffsetDateTime,
} from './meeting-time';

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

  it('Spring 에 보낼 오프셋 시각과 409 저장 시각 되돌림', () => {
    expect(toKstOffsetDateTime('26. 12. 01', '13:00–14:00')).toBe(
      '2026-12-01T13:00:00+09:00',
    );
    expect(toKstOffsetDateTime('', '')).toBe('');
    expect(fromOffsetDateTime('2026-12-31T15:30:00Z')).toEqual({
      date: '27. 01. 01',
      time: '00:30',
    });
  });
});
