import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { JwtService } from '@nestjs/jwt';
import { TokenDto } from 'src/domain/common/types/jwt';

// ===== 컨텍스트 =====
export const getWsCtx = (client: Socket) => {
  const data = client.data as {
    userId?: string;
    username?: string;
    roomId?: string;
  };
  const userInfo: Partial<UserInfo> = {
    userId: data.userId,
    username: data.username,
  };
  const roomId = data.roomId;
  const logPrefix = `[room:${roomId ?? '-'}][user:${userInfo?.userId ?? '-'}]`;
  return { userInfo, roomId, logPrefix };
};

// ===== 토큰 검증 =====
export const verifyToken = (
  token: string,
  jwtService: JwtService,
): TokenDto => {
  try {
    const verify = jwtService.verify<TokenDto>(token, {
      secret: process.env.JWT_SECRET,
    });
    if (!verify) {
      throw new UnauthorizedException('인증이 유효하지 않습니다.');
    }
    return verify;
  } catch {
    // const errorMessage =
    //   error instanceof Error ? error.message : 'Unknown error';
    // logger.error(`Token verification failed: ${errorMessage}`);
    throw new UnauthorizedException('인증이 유효하지 않습니다.');
  }
};
