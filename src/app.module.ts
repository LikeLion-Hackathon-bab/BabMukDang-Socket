import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { WsErrorInterceptor } from './domain/common/ws-error.interceptor';
import { WsRoomRequiredGuard } from './domain/common/ws-room-required.guard';
import { LoggerModule } from './domain/common/logger/logger.module';
import { WsContextInterceptor } from './domain/common/logger/ws-context.interceptor';
import { AnnouncementModule } from './namespace/announcement.module';
import { InvitationModule } from './namespace/invitation.module';
import { ImageUploadModule } from './domain/image-upload/image-upload.module';
import { HttpModule } from '@nestjs/axios';
import { ServerService } from './domain/room/services/server.service';
@Module({
  imports: [
    AnnouncementModule,
    InvitationModule,
    LoggerModule,
    ImageUploadModule,
    HttpModule,
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ServerService,
    { provide: APP_INTERCEPTOR, useClass: WsContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: WsErrorInterceptor },
    { provide: APP_GUARD, useClass: WsRoomRequiredGuard },
  ],
})
export class AppModule {}
