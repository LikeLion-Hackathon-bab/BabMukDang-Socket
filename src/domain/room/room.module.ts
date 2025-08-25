import { Global, Module } from '@nestjs/common';
import { RoomStoreService } from './services/room.service';
import { RoomHandlers } from './gateway/room.gateway';
import { ServerService } from './services/server.service';
import { HttpModule } from '@nestjs/axios';
@Global()
@Module({
  imports: [HttpModule],
  providers: [RoomStoreService, RoomHandlers, ServerService],
  exports: [RoomStoreService, RoomHandlers, ServerService],
})
export class RoomModule {}
