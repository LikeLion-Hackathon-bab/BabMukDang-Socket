import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { ChatHandlers } from './gateway/chat.gateway';

@Module({
  imports: [RoomModule],
  providers: [ChatHandlers],
  exports: [ChatHandlers],
})
export class ChatModule {}
