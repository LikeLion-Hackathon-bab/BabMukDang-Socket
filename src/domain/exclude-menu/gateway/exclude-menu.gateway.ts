import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { ExcludeMenuDto } from '../dto/request.dto';
import { ExcludeMenuService } from '../services/exclude-menu.service';

@Injectable()
export class ExcludeMenuHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly excludeMenuService: ExcludeMenuService,
  ) {}
  server: Server;
  // ===== 메뉴 제외 관련 핸들러 =====

  handleExcludeMenu(
    client: Socket,
    payload: ExcludeMenuDto,
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { categoryId } = payload;
    this.excludeMenuService.addUserExclusions(
      roomId,
      userInfo.userId,
      categoryId,
    );
    this.logger.log(
      `User ${userInfo.userId} excluded menu ${categoryId} in room ${roomId}`,
    );
    const responseDto =
      this.excludeMenuService.getAllUserExclusionsSerialized(roomId);
    // 다른 참여자들에게 메뉴 제외 상태 변경 알림
    this.server.to(roomId).emit('menu-exclusion-updated', responseDto);
  }
}
