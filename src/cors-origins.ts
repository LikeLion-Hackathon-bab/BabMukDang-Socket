/**
 * 허용할 화면 주소. CLIENT_ORIGIN 은 쉼표로 여러 개를 쓸 수 있고 빈 값은 무시한다(리뷰 S12).
 * HTTP CORS 와 Socket.IO 핸드셰이크가 같은 목록을 쓴다(보안 리뷰: Socket.IO origin '*').
 */
export const DEFAULT_CLIENT_ORIGIN = 'https://bab-muk-dang-client.vercel.app';
export const LOCAL_CLIENT_ORIGIN = 'http://localhost:3001';

export function clientOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = configured.length > 0 ? configured : [DEFAULT_CLIENT_ORIGIN];
  return Array.from(new Set([...list, LOCAL_CLIENT_ORIGIN]));
}

/** Socket.IO cors.origin 용. 요청마다 env 를 읽는다(데코레이터 평가 시점에는 .env 가 아직 없을 수 있다) */
export function socketCorsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  // Origin 헤더가 없는 요청(서버 간·네이티브 클라이언트)은 CORS 대상이 아니다. 인증은 JWT 미들웨어가 한다
  if (!origin) return callback(null, true);
  callback(null, clientOrigins().includes(origin));
}
