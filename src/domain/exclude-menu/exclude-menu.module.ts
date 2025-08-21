import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { ExcludeMenuHandlers } from './gateway/exclude-menu.gateway';
import { ExcludeMenuService } from './services/exclude-menu.service';

@Module({
  imports: [RoomModule],
  providers: [ExcludeMenuHandlers, ExcludeMenuService],
  exports: [ExcludeMenuHandlers, ExcludeMenuService],
})
export class ExcludeMenuModule {}
