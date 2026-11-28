/* 통합 시험 공용 도구: 실제 Nest 앱(AppModule)과 socket.io 클라이언트, 가짜 Spring 서버 */
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket as ClientSocket } from 'socket.io-client';

export const QA_ENV = {
  JWT_SECRET: 'qa-socket-secret',
  ROOM_RESULT_KEY: 'qa-room-key',
};
for (const [k, v] of Object.entries(QA_ENV)) process.env[k] = v;

export type Recorded = { ev: string; args: unknown[]; at: number };

export interface QaClient {
  userId: string;
  socket: ClientSocket;
  events: Recorded[];
  errors: string[];
  of(ev: string): unknown[];
  waitFor<T = unknown>(
    ev: string,
    pred?: (payload: T) => boolean,
    timeoutMs?: number,
    since?: number,
  ): Promise<T>;
  close(): void;
}

export function token(userId: string, username = `user${userId}`): string {
  return new JwtService({ secret: QA_ENV.JWT_SECRET }).sign({
    sub: userId,
    username,
    role: 'user',
    email: `${userId}@qa.test`,
  });
}

export function connectUser(
  port: number,
  userId: string,
  roomId: string,
  ns = 'announcement',
): QaClient {
  const socket = io(`http://127.0.0.1:${port}/${ns}`, {
    query: { roomId },
    auth: { token: token(userId) },
    transports: ['websocket'],
    reconnectionDelay: 100,
    reconnectionDelayMax: 300,
    forceNew: true,
  });
  const events: Recorded[] = [];
  const errors: string[] = [];
  const waiters: Array<() => void> = [];
  const notify = () => waiters.splice(0).forEach((w) => w());
  socket.onAny((ev: string, ...args: unknown[]) => {
    events.push({ ev, args, at: Date.now() });
    notify();
  });
  socket.on('connect_error', (e: Error) => {
    errors.push(e.message);
    notify();
  });
  const client: QaClient = {
    userId,
    socket,
    events,
    errors,
    of: (ev) => events.filter((e) => e.ev === ev).map((e) => e.args[0]),
    waitFor<T>(
      ev: string,
      pred: (p: T) => boolean = () => true,
      timeoutMs = 8000,
      since = 0,
    ) {
      return new Promise<T>((resolve, reject) => {
        const check = () => {
          const hit = events.find(
            (e) => e.ev === ev && e.at >= since && pred(e.args[0] as T),
          );
          if (hit) {
            clearTimeout(timer);
            resolve(hit.args[0] as T);
            return true;
          }
          return false;
        };
        const timer = setTimeout(() => {
          reject(
            new Error(
              `user ${userId}: '${ev}' not received in ${timeoutMs}ms (errors=${errors.join(',')})`,
            ),
          );
        }, timeoutMs);
        const loop = () => {
          if (!check()) waiters.push(loop);
        };
        loop();
      });
    },
    close: () => {
      socket.removeAllListeners();
      socket.close();
    },
  };
  return client;
}

export async function connected(c: QaClient, timeoutMs = 5000): Promise<void> {
  if (c.socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new Error(`user ${c.userId} not connected: ${c.errors.join(',')}`),
        ),
      timeoutMs,
    );
    c.socket.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** 가짜 Spring: POST /api/v1/meetings/:id/result 를 기록하고 지연·실패를 흉내 낸다 */
export class FakeSpring {
  calls: Array<{ id: string; restaurant: string; at: number }> = [];
  stored = new Map<string, string>();
  delayMs = 0;
  failNext = 0;
  private server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const m = /^\/api\/v1\/meetings\/([^/]+)\/result$/.exec(req.url ?? '');
      if (!m || req.headers['x-room-key'] !== QA_ENV.ROOM_RESULT_KEY) {
        res.statusCode = 403;
        return res.end();
      }
      const { restaurant } = JSON.parse(body || '{}') as {
        restaurant: string;
      };
      this.calls.push({ id: m[1], restaurant, at: Date.now() });
      setTimeout(() => {
        if (this.failNext > 0) {
          this.failNext -= 1;
          res.statusCode = 503;
          return res.end();
        }
        // Spring MeetingRepository.record: insert ... on duplicate key update (첫 값 유지)
        if (!this.stored.has(m[1])) this.stored.set(m[1], restaurant);
        res.statusCode = this.stored.get(m[1]) === restaurant ? 204 : 409;
        res.end();
      }, this.delayMs);
    });
  });
  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }
  async stop() {
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}

export async function bootApp(
  port = 0,
  customize?: (b: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<{ app: INestApplication; port: number }> {
  // 환경변수(JWT_SECRET)를 먼저 넣은 뒤 불러와야 JwtModule 이 같은 비밀키를 쓴다
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod0 = require('src/app.module') as typeof import('src/app.module');
  const { AppModule } = mod0;
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (customize) builder = customize(builder);
  const mod = await builder.compile();
  const app = mod.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(port, '127.0.0.1');
  const httpServer = app.getHttpServer() as http.Server;
  const addr = httpServer.address() as AddressInfo;
  return { app, port: addr.port };
}

/** Spring 의 ensureAnnouncement 와 같은 요청으로 방을 준비 */
export async function seedAnnouncement(
  port: number,
  postId: string,
  userIds: string[],
): Promise<number> {
  const res = await fetch(
    `http://127.0.0.1:${port}/api/announcement/${postId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Room-Key': QA_ENV.ROOM_RESULT_KEY,
      },
      body: JSON.stringify({
        announcementId: postId,
        location: '서울 마포구',
        meetingAt: '2026-12-01T12:00',
        participants: userIds.map((u) => ({
          userId: u,
          userName: `user${u}`,
          userProfileImageURL: '',
        })),
        recentMenu: userIds.map((u) => ({ userId: u, menu: [] })),
      }),
    },
  );
  return res.status;
}

export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/** 모두 준비 → 다음 단계 stage-changed 까지 대기 */
export async function allReadyAndAdvance(
  clients: QaClient[],
  nextStage: string,
): Promise<void> {
  const since = Date.now();
  for (const c of clients) c.socket.emit('ready-state', { isReady: true });
  await Promise.all(
    clients.map((c) =>
      c.waitFor<{ stage: string }>(
        'stage-changed',
        (p) => p.stage === nextStage,
        9000,
        since,
      ),
    ),
  );
}
