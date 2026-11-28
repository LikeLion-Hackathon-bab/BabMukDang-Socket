import { Injectable } from '@nestjs/common';
import { ChatMessageDto } from 'src/domain/chat';
import type { ChatSendRequestDto } from 'src/domain/chat';
import type { UserInfo } from 'src/domain/common/types';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';

@Injectable()
export class ChatHandlers {
  constructor(
    private readonly logger: WsLogger,
    private readonly roomService: RoomStoreService,
  ) {}
  handleChatMessage(
    client: Socket,
    payload: ChatSendRequestDto,
    roomId: string,
    userInfo: UserInfo,
  ) {
    const { text } = payload;
    // ChatSendDto를 ChatMessageDto로 변환
    const chatMessage: ChatMessageDto = {
      // 같은 ms 에 온 메시지도 구별되도록(형식 msg_<시각>_<임의값>, 문자열 계약 유지)
      messageId: `msg_${Date.now()}_${randomUUID().slice(0, 8)}`,
      roomId,
      user: userInfo,
      text,
      createdAt: new Date().toISOString(),
    };

    this.roomService.addChatMessage(roomId, chatMessage);
    client.to(roomId).emit('chat-message', chatMessage);

    this.logger.log(`Chat message from ${userInfo.username}: ${text}`);
  }
}
