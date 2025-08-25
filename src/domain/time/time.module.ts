import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { TimeHandlers } from './gateway/time.gateway';
import { TimeService } from './services/time.service';

@Module({
  imports: [RoomModule],
  providers: [TimeHandlers, TimeService],
  exports: [TimeHandlers, TimeService],
})
export class TimeModule {}
