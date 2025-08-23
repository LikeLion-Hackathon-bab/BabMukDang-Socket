import { Module } from '@nestjs/common';
// import { MenuService } from './services/menu.service';
import { MenuHandlers } from './gateway/menu.gateway';
import { RoomModule } from '../room/room.module';
import { MenuService } from './services/menu.service';

@Module({
  imports: [RoomModule],
  providers: [MenuHandlers, MenuService],
  exports: [MenuHandlers, MenuService],
})
export class MenuModule {}
