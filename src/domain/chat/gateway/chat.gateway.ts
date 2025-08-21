import { Injectable } from '@nestjs/common';
import { ChatMessageDto } from 'src/domain/chat';
import type { ChatSendRequestDto } from 'src/domain/chat';
import type { UserInfo } from 'src/domain/common/types';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { RoomStoreService } from 'src/domain/room/services/room.service';
import { Socket } from 'socket.io';

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
      messageId: `msg_${Date.now()}`,
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
