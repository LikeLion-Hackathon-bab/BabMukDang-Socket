import { Module } from '@nestjs/common';
import { PromiseGateway } from './promise.gateway';
import { RoomService } from './services/room.service';
import { ChatService } from './services/chat.service';
import { PhaseService } from './services/phase.service';
import { GuardService } from './services/guard.service';

@Module({
  providers: [
    PromiseGateway,
    RoomService,
    ChatService,
    PhaseService,
    GuardService,
  ],
  exports: [
    PromiseGateway,
    RoomService,
    ChatService,
    PhaseService,
    GuardService,
  ],
})
export class PromiseModule {}
