import {
  Body,
  Controller,
  UseGuards,
  Inject,
  Param,
  Post,
  Query,
  HttpCode,
} from '@nestjs/common';
import { RoomKeyGuard } from './room-key.guard';
import { RoomStoreService } from './domain/room/services/room.service';
import {
  AnnouncementRequestDto,
  InvitationRequestDto,
  LeaveRoomDto,
} from './domain/room/dto/server';
import { ANNOUNCEMENT_ROOM_STORE } from './namespace/announcement.handlers';
import { INVITATION_ROOM_STORE } from './namespace/invitation.handlers';

/**
 * Spring 전용 서버 간 엔드포인트. 모두 X-Room-Key 가 필요하다.
 * 개발용 GET /(임의 사용자 JWT 발급)와 GET test/* 는 쓰는 곳이 없어 지웠다(보안 리뷰 M1).
 */
@Controller()
@UseGuards(RoomKeyGuard)
export class AppController {
  constructor(
    @Inject(ANNOUNCEMENT_ROOM_STORE)
    private readonly announcementStore: RoomStoreService,
    @Inject(INVITATION_ROOM_STORE)
    private readonly invitationStore: RoomStoreService,
  ) {}

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
