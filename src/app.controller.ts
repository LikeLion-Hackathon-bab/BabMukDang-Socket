import {
  Body,
  Controller,
  UseGuards,
  Get,
  Inject,
  Param,
  Post,
  Query,
  HttpCode,
} from '@nestjs/common';
import { RoomKeyGuard } from './room-key.guard';
import { AppService } from './app.service';
import { ServerService } from './domain/room/services/server.service';
import { RoomStoreService } from './domain/room/services/room.service';
import {
  AnnouncementRequestDto,
  AnnouncementResultRequestDto,
  InvitationRequestDto,
  InvitationResultRequestDto,
  LeaveRoomDto,
} from './domain/room/dto/server';
import { ANNOUNCEMENT_ROOM_STORE } from './namespace/announcement.handlers';
import { INVITATION_ROOM_STORE } from './namespace/invitation.handlers';

@Controller()
@UseGuards(RoomKeyGuard)
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly serverService: ServerService,
    @Inject(ANNOUNCEMENT_ROOM_STORE)
    private readonly announcementStore: RoomStoreService,
    @Inject(INVITATION_ROOM_STORE)
    private readonly invitationStore: RoomStoreService,
  ) {}

  @Get()
  getJWT(
    @Query('username') username: string,
    @Query('userId') userId: string,
  ): string {
    return this.appService.getJWT(username || 'testuser', userId || '1');
  }
  @Get('test/announcement/:announcementId')
  testGetAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() body: AnnouncementResultRequestDto,
  ) {
    return this.serverService.postAnnouncementResult(announcementId, body);
  }
  @Get('test/invitation/:invitationId')
  testGetInvitation(
    @Param('invitationId') invitationId: string,
    @Body() body: InvitationResultRequestDto,
  ) {
    return this.serverService.postInvitationResult(invitationId, body);
  }
  @Post('api/announcement/:announcementId')
  setUpAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() body: AnnouncementRequestDto,
    @Query('authoritative') authoritative?: string,
  ) {
    const roomId = `announcement:${announcementId}`;
    return this.announcementStore.seedFromAnnouncement(
      roomId,
      body,
      authoritative === 'true',
    );
  }
  @Post('api/announcement/:announcementId/leave')
  @HttpCode(200)
  leaveAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() body: LeaveRoomDto,
  ) {
    return {
      result: this.announcementStore.leaveRoom(
        `announcement:${announcementId}`,
        body.userId,
        body.dissolve === true,
      ),
    };
  }
  @Post('api/invitation/:invitationId/leave')
  @HttpCode(200)
  leaveInvitation(
    @Param('invitationId') invitationId: string,
    @Body() body: LeaveRoomDto,
  ) {
    return {
      result: this.invitationStore.leaveRoom(
        `invitation:${invitationId}`,
        body.userId,
        body.dissolve === true,
      ),
    };
  }
  @Post('api/invitation/:invitationId')
  setUpInvitation(
    @Param('invitationId') invitationId: string,
    @Body() body: InvitationRequestDto,
    @Query('authoritative') authoritative?: string,
  ) {
    const roomId = `invitation:${invitationId}`;
    return this.invitationStore.seedFromInvitation(
      roomId,
      body,
      authoritative === 'true',
    );
  }
}
