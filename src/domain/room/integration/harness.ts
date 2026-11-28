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
  /** 공고: POST /api/v1/meetings/:id/result  (contracts/meeting-result.md) */
  calls: Array<{ id: string; restaurant: string; at: number }> = [];
  stored = new Map<string, string>();
  /** 초대: POST /api/v1/meetings/invitations/:id/result (contracts/invitation-result.md) */
  invitationCalls: Array<{
    id: string;
    body: Record<string, unknown>;
    at: number;
  }> = [];
  invitationStored = new Map<
    string,
    { meetingAt: string; location: string; restaurant: string }
  >();
  acceptedInvitations = new Set<string>(['3']);
  delayMs = 0;
  failNext = 0;
  private server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const json = (status: number, payload?: unknown) => {
        res.statusCode = status;
        if (payload) res.setHeader('content-type', 'application/json');
        res.end(payload ? JSON.stringify(payload) : undefined);
      };
      if (req.headers['x-room-key'] !== QA_ENV.ROOM_RESULT_KEY)
        return json(403);
      const parsed = JSON.parse(body || '{}') as Record<string, unknown>;
      const inv = /^\/api\/v1\/meetings\/invitations\/(\d+)\/result$/.exec(
        req.url ?? '',
      );
      const ann = /^\/api\/v1\/meetings\/(\d+)\/result$/.exec(req.url ?? '');
      if (inv)
        this.invitationCalls.push({ id: inv[1], body: parsed, at: Date.now() });
      else if (ann)
        this.calls.push({
          id: ann[1],
          restaurant: String(parsed.restaurant),
          at: Date.now(),
        });
      else return json(404);
      setTimeout(() => {
        if (this.failNext > 0) {
          this.failNext -= 1;
          return json(503);
        }
        if (ann) {
          // Spring MeetingRepository.record: insert ... on duplicate key update (첫 값 유지)
          const restaurant = String(parsed.restaurant);
          if (!this.stored.has(ann[1])) this.stored.set(ann[1], restaurant);
          const saved = this.stored.get(ann[1])!;
          return saved === restaurant
            ? json(204)
            : json(409, {
                code: 'HTTP_409',
                message: '이미 다른 식당으로 확정된 공고입니다.',
                data: { restaurant: saved },
              });
        }
        const id = inv![1];
        if (!this.acceptedInvitations.has(id))
          return json(409, {
            code: 'HTTP_409',
            message: '수락된 초대가 아닙니다.',
          });
        const { meetingAt, location, restaurant, invitationId } =
          parsed as Record<string, string>;
        if (
          !/[+-]\d{2}:\d{2}$|Z$/.test(String(meetingAt)) ||
          !location ||
          !restaurant ||
          (invitationId !== undefined && String(invitationId) !== id)
        )
          return json(400, { code: 'HTTP_400' });
        const next = { meetingAt, location, restaurant };
        if (!this.invitationStored.has(id)) this.invitationStored.set(id, next);
        const saved = this.invitationStored.get(id)!;
        const same =
          Date.parse(saved.meetingAt) === Date.parse(meetingAt) &&
          saved.location === location &&
          saved.restaurant === restaurant;
        return same
          ? json(204)
          : json(409, {
              code: 'HTTP_409',
              message: '이미 다른 결과로 확정된 초대입니다.',
              data: saved,
            });
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
  opts: { authoritative?: boolean } = {},
): Promise<number> {
  const res = await fetch(
    `http://127.0.0.1:${port}/api/announcement/${postId}${
      opts.authoritative ? '?authoritative=true' : ''
    }`,
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
