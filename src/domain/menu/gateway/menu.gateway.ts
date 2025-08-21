import { Injectable } from '@nestjs/common';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { Server, Socket } from 'socket.io';
import type { UserInfo } from 'src/domain/common/types';
import { MenuPickDto } from '../dto/request.dto';
import { WsClient, WsRoom, WsUser } from 'src/domain/common/websoket.decorator';
import { MenuService } from '../services/menu.service';

@Injectable()
export class MenuHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly menuService: MenuService,
  ) {}
  server: Server;
  // ===== 메뉴 선택 관련 핸들러 =====
  handlePickMenu(
    @WsClient() client: Socket,
    payload: MenuPickDto,
    @WsRoom() roomId: string,
    @WsUser() userInfo: UserInfo,
  ) {
    const { menuId } = payload;

    this.menuService.selectMenu(roomId, userInfo.userId, menuId);

    this.logger.log(
      `User ${userInfo.userId} picked menu ${menuId} in room ${roomId}`,
    );

    const responseDto = this.menuService.getAllUserSelectionsSerialized(roomId);
    // 다른 참여자들에게 메뉴 선택 상태 변경 알림
    this.server.to(roomId).emit('menu-pick-updated', responseDto);
  }
}
