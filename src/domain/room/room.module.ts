import { Global, Module } from '@nestjs/common';
import { RoomStoreService } from './services/room.service';
import { RoomHandlers } from './gateway/room.gateway';

@Global()
@Module({
  providers: [RoomStoreService, RoomHandlers],
  exports: [RoomStoreService, RoomHandlers],
})
export class RoomModule {}
