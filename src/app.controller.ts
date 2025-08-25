import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AppService } from './app.service';
import { ServerService } from './domain/room/services/server.service';
import { RoomStoreService } from './domain/room/services/room.service';
import {
  AnnouncementRequestDto,
  AnnouncementResultRequestDto,
  InvitationRequestDto,
  InvitationResultRequestDto,
} from './domain/room/dto/server';
import { ANNOUNCEMENT_ROOM_STORE } from './namespace/announcement.handlers';
import { INVITATION_ROOM_STORE } from './namespace/invitation.handlers';

@Controller()
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
  ) {
    const roomId = `announcement:${announcementId}`;
    return this.announcementStore.seedFromAnnouncement(roomId, body);
  }
  @Post('api/invitation/:invitationId')
  setUpInvitation(
    @Param('invitationId') invitationId: string,
    @Body() body: InvitationRequestDto,
  ) {
    const roomId = `invitation:${invitationId}`;
    return this.invitationStore.seedFromInvitation(roomId, body);
  }
}
