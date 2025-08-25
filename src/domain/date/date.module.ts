import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { DateHandlers } from './gateway/date.gateway';
import { DateService } from './services/date.service';

@Module({
  imports: [RoomModule],
  providers: [DateHandlers, DateService],
  exports: [DateHandlers, DateService],
})
export class DateModule {}
