import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../types';

export const User = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // JWT Payload에서 iat, exp를 제외한 사용자 정보 추출
    const request: Request = ctx.switchToHttp().getRequest();
    const { iat, exp, ...user } = request.user as JwtPayload;
    return data ? user[data] : user;
  },
);
