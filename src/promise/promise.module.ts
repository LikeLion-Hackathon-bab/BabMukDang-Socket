import { Module } from '@nestjs/common';
import { PromiseGateway } from './promise.gateway';
import { RoomService } from './services/room.service';
import { ChatService } from './services/chat.service';
import { PhaseService } from './services/phase.service';

// Guards
import { UserOwnershipGuard } from './guards';
import { WsGuard } from './guards/auth.guard';

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

    // Guards
    UserOwnershipGuard,

    // Interceptors
    LoggingInterceptor,
    DataOwnershipInterceptor,
    ErrorHandlingInterceptor,

    WsGuard,
  ],
  exports: [
    PromiseGateway,
    RoomService,
    ChatService,
    PhaseService,

    // Guards
    UserOwnershipGuard,

    // Interceptors
    LoggingInterceptor,
    DataOwnershipInterceptor,
    ErrorHandlingInterceptor,

    // DTOs are now handled by global ValidationPipe
  ],
})
export class PromiseModule {}
