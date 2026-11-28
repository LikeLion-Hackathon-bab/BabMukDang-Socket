import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class RoomKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.ROOM_RESULT_KEY;
    const key = context.switchToHttp().getRequest<Request>().get('X-Room-Key');
    if (!configured || !key) return false;
    const expected = Buffer.from(configured);
    const received = Buffer.from(key);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}
