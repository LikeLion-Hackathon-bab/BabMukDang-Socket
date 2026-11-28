import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { verifyToken } from 'src/namespace/utils';

export type AuthedRequest = Request & { authUserId?: string };

/**
 * 업로드 서명 발급용 Bearer JWT 가드(보안 리뷰 S3).
 * 소켓 핸드셰이크와 같은 토큰·같은 JWT_SECRET 으로 검증하고, 사용자 id 는 토큰 sub 에서만 꺼낸다.
 */
@Injectable()
export class HttpJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.get('Authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('인증이 필요합니다.');
    const payload = verifyToken(token, this.jwtService);
    if (!payload?.sub) throw new UnauthorizedException('인증이 필요합니다.');
    req.authUserId = String(payload.sub);
    return true;
  }
}
