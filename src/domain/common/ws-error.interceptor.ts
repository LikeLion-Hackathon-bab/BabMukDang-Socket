import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, EMPTY } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Socket } from 'socket.io';
import { MESSAGE_METADATA } from '@nestjs/websockets/constants';

export const WS_ERROR_EVENT = 'ws:errorEvent';
export const WsErrorEvent = (event: string) =>
  SetMetadata(WS_ERROR_EVENT, event);
@Injectable()
export class WsErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger('WsError');

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'ws') {
      return next.handle();
    }

    const client = context.switchToWs().getClient<Socket>();
    const roomId = client?.data?.roomId;
    const userId = client?.data?.userId;

    const handler = context.getHandler?.();
    const errorEvent =
      (handler && this.reflector.get<string>(MESSAGE_METADATA, handler)) ||
      handler?.name + '-error' ||
      this.reflector.get<string>(WS_ERROR_EVENT, context.getHandler()) ||
      'unknown-ws-error';

    return next.handle().pipe(
      catchError((err) => {
        const message = err?.message ?? 'Unknown error';
        this.logger.error(
          `[room:${roomId ?? '-'}][user:${userId ?? '-'}] ${message}`,
        );

        client.emit(errorEvent, {
          ok: false,
          message,
          roomId,
          timestamp: Date.now(),
        });

        // 기본 'exception' 이벤트를 막고 종료
        return EMPTY;
      }),
    );
  }
}
