import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type WsCtx = {
  ns?: string; // /room, /presence ...
  event?: string; // pick-menu, send-chat ...
  sid?: string; // socket.id
  roomId?: string;
  userId?: string;
  gateway?: string; // 클래스명(선택)
  handler?: string; // 메서드명(선택)
};

@Injectable()
export class WsContextStore {
  private als = new AsyncLocalStorage<WsCtx>();

  run<T>(ctx: WsCtx, fn: () => T): T {
    console.log('WsContextStore run');
    return this.als.run(ctx, fn);
  }
  get(): WsCtx | undefined {
    return this.als.getStore();
  }
}
