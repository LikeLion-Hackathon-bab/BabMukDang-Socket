// ws-context.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { WsContextStore } from './ws-context.store';
import type { Socket } from 'socket.io';
// (가능하면 사용) Nest 내부 메타키: SubscribeMessage 이벤트명
import { MESSAGE_METADATA } from '@nestjs/websockets/constants';

type ExtSocket = Socket & { data: { roomId?: string; userId?: string } };

@Injectable()
export class WsContextInterceptor implements NestInterceptor {
  constructor(
    private readonly store: WsContextStore,
    private readonly refl: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('WsContextInterceptor');
    if (ctx.getType() !== 'ws') return next.handle();

    const ws = ctx.switchToWs();
    const client = ws.getClient<ExtSocket>();

    const ns = (client as any).nsp?.name ?? '';
    // @SubscribeMessage('event') 값 뽑기 (없으면 메서드명으로 대체)
    const handler = ctx.getHandler?.();
    const event =
      (handler && this.refl.get<string>(MESSAGE_METADATA, handler)) ||
      handler?.name ||
      'unknown';

    const gateway = ctx.getClass?.()?.name;
    const sid = client.id;
    const roomId = client.data?.roomId;
    const userId = client.data?.userId;

    return this.store.run(
      { ns, event, sid, roomId, userId, gateway, handler: handler?.name },
      () => next.handle(),
    );
  }
}
