import { Injectable } from '@nestjs/common';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { Server, Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { TimeService } from '../services/time.service';

@Injectable()
export class TimeHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly timeService: TimeService,
  ) {}
  server: Server;

  handlePickTimes(
    client: Socket,
    payload: { times: string[] },
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { times } = payload;
    this.timeService.pickMany(roomId, userInfo.userId, times);
    this.logger.log(
      `User ${userInfo.userId} picked times [${times.join(', ')}] in room ${roomId}`,
    );
    const responseDto = this.timeService.getSerialized(roomId);
    this.server.to(roomId).emit('time-updated', responseDto);
  }
}
