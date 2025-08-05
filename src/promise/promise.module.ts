import { Module } from '@nestjs/common';
// import { PromiseGateway } from './promise.gateway';
import { AnnouncementGateway } from './announcement.gateway';
import { InvitationGateway } from './invitation.gateway';
import { RoomService } from './services/room.service';
import { ChatService } from './services/chat.service';
import { PhaseService } from './services/phase.service';
import { GuardService } from './services/guard.service';

@Module({
  providers: [
    // PromiseGateway,
    AnnouncementGateway,
    InvitationGateway,
    RoomService,
    ChatService,
    PhaseService,
    GuardService,
  ],
  exports: [
    // PromiseGateway,
    AnnouncementGateway,
    InvitationGateway,
    RoomService,
    ChatService,
    PhaseService,
    GuardService,
  ],
})
export class PromiseModule {}
