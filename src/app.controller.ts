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
  @Post('test/announcement/:announcementId')
  testPostAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() body: AnnouncementResultRequestDto,
  ) {
    return this.serverService.postAnnouncementResult(announcementId, body);
  }
  @Post('test/invitation/:invitationId')
  testPostInvitation(
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

  // ============================================
  // 개발 환경 전용 테스트 엔드포인트
  // Spring 서버 없이 mock 데이터로 테스트
  // ============================================

  /**
   * Mock Announcement 방 생성
   * POST /dev/mock/announcement/:id
   */
  @Post('dev/mock/announcement/:announcementId')
  createMockAnnouncement(@Param('announcementId') announcementId: string) {
    const roomId = `announcement:${announcementId}`;
    const mockData: AnnouncementRequestDto = {
      announcementId,
      location: '서울시 강남구 테헤란로 123',
      meetingAt: '2025-01-15 12:00',
      participants: [
        { userId: 'mock-user-1', userName: '테스트유저1' },
        // { userId: 'mock-user-2', userName: '테스트유저2' },
        // { userId: 'mock-user-3', userName: '테스트유저3' },
      ],
      recentMenu: [
        {
          userId: 'mock-user-1',
          menu: [
            { code: '1', label: '비빔밥' },
            { code: '2', label: '김치찌개' },
          ],
        },
        // {
        //   userId: 'mock-user-1',
        //   menu: [
        //     { code: '3', label: '된장찌개' },
        //     { code: '4', label: '불고기' },
        //   ],
        // },
      ],
    };
    this.announcementStore.seedFromAnnouncement(roomId, mockData);
    return {
      success: true,
      roomId,
      message: `Mock announcement room created: ${roomId}`,
      connectUrl: `/announcement?room=${announcementId}`,
    };
  }

  /**
   * Mock Invitation 방 생성
   * POST /dev/mock/invitation/:id
   */
  @Post('dev/mock/invitation/:invitationId')
  createMockInvitation(@Param('invitationId') invitationId: string) {
    const roomId = `invitation:${invitationId}`;
    const mockData: InvitationRequestDto = {
      invitationId,
      participants: [
        { userId: 'mock-user-1', userName: '테스트유저1' },
        { userId: 'mock-user-2', userName: '테스트유저2' },
      ],
      recentMenu: [
        {
          userId: 'mock-user-1',
          menu: [
            { code: '5', label: '파스타' },
            { code: '6', label: '피자' },
          ],
        },
      ],
    };
    this.invitationStore.seedFromInvitation(roomId, mockData);
    return {
      success: true,
      roomId,
      message: `Mock invitation room created: ${roomId}`,
      connectUrl: `/invitation?room=${invitationId}`,
    };
  }

  /**
   * 개발용 방 상태 조회
   * GET /dev/room/:type/:id
   */
  @Get('dev/room/:type/:id')
  getDevRoomState(
    @Param('type') type: 'announcement' | 'invitation',
    @Param('id') id: string,
  ) {
    const roomId = `${type}:${id}`;
    const store =
      type === 'announcement' ? this.announcementStore : this.invitationStore;
    const room = store.getRoom(roomId);
    if (!room) {
      return { error: 'Room not found', roomId };
    }
    return {
      roomId,
      stage: room.stage,
      participantCount: room.participants.size,
      participants: Array.from(room.participants.values()),
    };
  }
}
