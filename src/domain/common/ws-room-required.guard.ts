import { Socket } from 'socket.io';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Reflector } from '@nestjs/core';

export const WS_ROOM_REQUIRED = 'ws:room_required';
// 핸들러/게이트웨이에서 필요 없게 만들고 싶을 때: @RoomRequired(false)
export const RoomRequired = (required = true) =>
  SetMetadata(WS_ROOM_REQUIRED, required);

@Injectable()
export class WsRoomRequiredGuard implements CanActivate {
  private readonly logger = new Logger(WsRoomRequiredGuard.name);
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // HTTP나 마이크로서비스 등은 통과
    if (ctx.getType() !== 'ws') return true;

    const client = ctx.switchToWs().getClient<Socket>();
    const nsp = (client as any).nsp?.name as string | undefined;

    // 특정 네임스페이스만 적용하고 싶다면 여기서 필터링
    // 예: /room만 검사, /presence는 통과
    // if (nsp && nsp !== '/room') return true;

    // 핸들러/클래스에 @RoomRequired(false) 있으면 스킵
    const required =
      this.reflector.getAllAndOverride<boolean>(WS_ROOM_REQUIRED, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? true;

    if (!required) return true;

    const roomId = client?.data?.roomId;
    const prefix = `[ns:${nsp ?? '-'}][sid:${client.id}][room:${roomId ?? '-'}][user:${client?.data?.userId ?? '-'}]`;

    if (!roomId) {
      this.logger.warn(`${prefix} request without roomId`);
      // 전역 WS 인터셉터/필터가 있다면 여기서 throw하면 그쪽에서 에러 이벤트로 변환됩니다.
      throw new WsException('roomId is required');
    }
    return true;
  }
}
