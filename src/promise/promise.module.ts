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

// Pipes
import {
  UserInfoValidationPipe,
  RoomIdValidationPipe,
  PhaseDataValidationPipe,
} from './pipes';

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

    // Pipes
    UserInfoValidationPipe,
    RoomIdValidationPipe,
    PhaseDataValidationPipe,
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

    // Pipes
    UserInfoValidationPipe,
    RoomIdValidationPipe,
    PhaseDataValidationPipe,
  ],
})
export class PromiseModule {}
