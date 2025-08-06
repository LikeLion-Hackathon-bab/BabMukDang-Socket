import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../types/user.types';

export const User = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // JWT Payload에서 iat, exp를 제외한 사용자 정보 추출
    const request = ctx.switchToHttp().getRequest();
    const { iat, exp, ...user } = request.user as JwtPayload;
    return data ? user[data] : user;
  },
);
