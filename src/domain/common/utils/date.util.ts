/**
 * 커스텀 날짜 포맷 파싱/변환 유틸리티
 * 서버와 클라이언트 간 날짜 형식 호환을 위함
 */

/**
 * 커스텀 날짜 포맷 '25. 08. 02' -> Date 객체
 */
export function parseCustomDate(dateStr: string): Date | null {
  // 형식: 'YY. MM. DD'
  const match = dateStr.match(/^(\d{2})\.\s*(\d{2})\.\s*(\d{2})$/);
  if (match) {
    const [, yy, mm, dd] = match;
    const year = 2000 + parseInt(yy, 10);
    const month = parseInt(mm, 10) - 1; // 0-indexed
    const day = parseInt(dd, 10);
    return new Date(year, month, day);
  }

  // ISO 날짜 fallback
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Date 객체 -> 커스텀 날짜 포맷 '25. 08. 02'
 */
export function formatToCustomDate(date: Date): string {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}. ${mm}. ${dd}`;
}

/**
 * 커스텀 날짜 포맷 '25. 08. 02' -> ISO 날짜 '2025-08-02'
 */
export function customDateToISO(dateStr: string): string | null {
  const date = parseCustomDate(dateStr);
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

/**
 * ISO 날짜 '2025-08-02' -> 커스텀 날짜 포맷 '25. 08. 02'
 */
export function isoToCustomDate(isoStr: string): string | null {
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return null;
  return formatToCustomDate(date);
}

/**
 * 날짜 문자열을 timestamp로 변환 (비교용)
 * 커스텀 포맷과 ISO 포맷 모두 지원
 */
export function dateToTimestamp(dateStr: string): number {
  const date = parseCustomDate(dateStr);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}
