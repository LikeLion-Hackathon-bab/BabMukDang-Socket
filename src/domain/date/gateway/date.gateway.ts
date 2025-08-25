import { Injectable } from '@nestjs/common';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { Server, Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { DateService } from '../services/date.service';

@Injectable()
export class DateHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly dateService: DateService,
  ) {}
  server: Server;

  handlePickDates(
    client: Socket,
    payload: { dates: string[] },
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { dates } = payload;
    this.dateService.pickMany(roomId, userInfo.userId, dates);
    this.logger.log(
      `User ${userInfo.userId} picked dates [${dates.join(', ')}] in room ${roomId}`,
    );
    const responseDto = this.dateService.getSerialized(roomId);
    this.server.to(roomId).emit('date-updated', responseDto);
  }
}
