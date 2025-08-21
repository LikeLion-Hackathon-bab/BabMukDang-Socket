import { Injectable, LoggerService, Logger } from '@nestjs/common';
import { WsContextStore } from './ws-context.store';

function prefix(ctx?: ReturnType<WsContextStore['get']>) {
  if (!ctx) {
    console.log('ctx is undefined');
    return '';
  }
  const parts = [
    ctx.ns && `ns:${ctx.ns}`,
    ctx.event && `evt:${ctx.event}`,
    ctx.sid && `sid:${ctx.sid}`,
    ctx.roomId && `room:${ctx.roomId}`,
    ctx.userId && `user:${ctx.userId}`,
  ].filter(Boolean);
  return parts.length ? `[${parts.join('][')}] ` : '';
}

@Injectable()
export class WsLogger implements LoggerService {
  private base = new Logger('WS');
  constructor(private readonly store: WsContextStore) {}

  log(message: any) {
    this.base.log(`${prefix(this.store.get())}${message}`);
  }
  error(message: any, trace?: string) {
    this.base.error(`${prefix(this.store.get())}${message}`, trace);
  }
  warn(message: any) {
    this.base.warn(`${prefix(this.store.get())}${message}`);
  }
  debug(message: any) {
    this.base.debug(`${prefix(this.store.get())}${message}`);
  }
  verbose(message: any) {
    this.base.verbose(`${prefix(this.store.get())}${message}`);
  }

  // 필요 시 가져다 쓸 수 있는 헬퍼 (컨텍스트 없는 곳에서 바인딩)
  bind(bindCtx: Parameters<WsContextStore['run']>[0]) {
    return {
      log: (m: any) => this.base.log(`${prefix(bindCtx)}${m}`),
      warn: (m: any) => this.base.warn(`${prefix(bindCtx)}${m}`),
      error: (m: any) => this.base.error(`${prefix(bindCtx)}${m}`),
      debug: (m: any) => this.base.debug(`${prefix(bindCtx)}${m}`),
    };
  }
}
