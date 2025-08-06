import { Module } from '@nestjs/common';
import { PromiseGateway } from './promise.gateway';
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
import {
  LoggingInterceptor,
  DataOwnershipInterceptor,
  ErrorHandlingInterceptor,
} from './interceptors';

// DTOs are now handled by global ValidationPipe

@Module({
  providers: [
    PromiseGateway,
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
    ErrorHandlingInterceptor,

    // DTOs are now handled by global ValidationPipe
  ],
  exports: [
    PromiseGateway,
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
    ErrorHandlingInterceptor,

    // DTOs are now handled by global ValidationPipe
  ],
})
export class PromiseModule {}
