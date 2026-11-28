/**
 * 초대방 확정 날짜·시간을 Spring 에 보낼 한국 시간 문자열로 만든다.
 * 화면이 보내는 값은 벽시계 시간이다: 날짜 'YY. MM. DD', 시간 'HH:mm–HH:mm'.
 * 이를 Date 로 바꿔 toISOString() 하면 UTC 로 옮겨져 KST 13:00 이 04:00 이 된다.
 * 시각 정보가 있는 ISO 문자열이 오면 Asia/Seoul 로 바꿔 쓴다.
 */
const KST = 'Asia/Seoul';

function kstParts(ms: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function toKstMeetingDate(date: string | undefined): string {
  const s = (date ?? '').trim();
  if (!s) return '';
  let m = /^(\d{2})\.\s*(\d{2})\.\s*(\d{2})\.?$/.exec(s);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? '' : kstParts(ms).date;
}

export function toKstMeetingTime(time: string | undefined): string {
  const s = (time ?? '').trim();
  if (!s) return '';
  const m = /^(\d{1,2}):(\d{2})(?:\s*[–-]\s*\d{1,2}:\d{2})?$/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? '' : kstParts(ms).time;
}

/** 날짜 칸이 비고 시간에 ISO 시각이 오면 그 시각의 KST 날짜를 쓴다 */
export function toKstMeeting(
  date: string | undefined,
  time: string | undefined,
) {
  const meetingTime = toKstMeetingTime(time);
  let meetingDate = toKstMeetingDate(date);
  if (!meetingDate && time && !Number.isNaN(Date.parse(time)))
    meetingDate = kstParts(Date.parse(time)).date;
  return { meetingDate, meetingTime };
}

/** 확정 날짜·시간 → Spring 에 보낼 오프셋 포함 시각 (KST +09:00). 만들 수 없으면 '' */
export function toKstOffsetDateTime(
  date: string | undefined,
  time: string | undefined,
): string {
  const { meetingDate, meetingTime } = toKstMeeting(date, time);
  if (!meetingDate || !meetingTime) return '';
  return `${meetingDate}T${meetingTime}:00+09:00`;
}

/** Spring 이 돌려준 저장 시각 → 화면 형식 날짜('YY. MM. DD')와 시간('HH:mm') */
export function fromOffsetDateTime(
  iso: string,
): { date: string; time: string } | undefined {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const { date, time } = kstParts(ms);
  const [y, m, d] = date.split('-');
  return { date: `${y.slice(2)}. ${m}. ${d}`, time };
}
