import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserInfo } from 'src/domain/common/types';
import { Socket } from 'socket.io';

export const WsClient = createParamDecorator((_, ctx: ExecutionContext) => {
  return ctx.switchToWs().getClient<Socket>();
});

export const WsUser = createParamDecorator(
  (_, ctx: ExecutionContext): UserInfo => {
    const client = ctx.switchToWs().getClient<Socket>();
    return {
      userId: client.data.userId,
      username: client.data.username,
    } as UserInfo;
  },
);

export const WsRoom = createParamDecorator(
  (_, ctx: ExecutionContext): string => {
    const client = ctx.switchToWs().getClient<Socket>();
    return client.data.roomId;
  },
);
