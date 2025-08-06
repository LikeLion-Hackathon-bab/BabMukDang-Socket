import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}
  canActivate(context: ExecutionContext): boolean {
    const token = context.switchToWs().getClient().handshake.auth.token;
    try {
      const verifyToken = (token: string): any => {
        const verify = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET,
        });
        const userId = verify.sub;
        if (!verify) {
          throw new UnauthorizedException('인증이 유효하지 않습니다. ');
        } else {
          return true;
        }
      };
      verifyToken(token);
      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  }
}
