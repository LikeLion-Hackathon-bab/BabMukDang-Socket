import { Module } from '@nestjs/common';
import { AnnouncementGateway } from './announcement.gateway';
import { InvitationGateway } from './invitation.gateway';
import { RoomService } from './services/room.service';
import { ChatService } from './services/chat.service';
import { PhaseService } from './services/phase.service';
import { GuardService } from './services/guard.service';

// Guards
import {
  RoomAccessGuard,
  UserOwnershipGuard,
  RoomManagementGuard,
} from './guards';

// Interceptors
import { LoggingInterceptor, DataOwnershipInterceptor } from './interceptors';

// DTOs are now handled by global ValidationPipe

@Module({
  providers: [
    // PromiseGateway,
    AnnouncementGateway,
    InvitationGateway,
    RoomService,
    ChatService,
    PhaseService,
    GuardService,

    // Guards
    RoomAccessGuard,
    UserOwnershipGuard,
    RoomManagementGuard,

    // Interceptors
    LoggingInterceptor,
    DataOwnershipInterceptor,

    // DTOs are now handled by global ValidationPipe
  ],
  exports: [
    // PromiseGateway,
    AnnouncementGateway,
    InvitationGateway,
    RoomService,
    ChatService,
    PhaseService,
    GuardService,

    // Guards
    RoomAccessGuard,
    UserOwnershipGuard,
    RoomManagementGuard,

    // Interceptors
    LoggingInterceptor,
    DataOwnershipInterceptor,

    // DTOs are now handled by global ValidationPipe
  ],
})
export class PromiseModule {}
