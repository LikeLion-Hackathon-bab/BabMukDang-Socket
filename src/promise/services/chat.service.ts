import { Injectable, Logger } from '@nestjs/common';
import { ChatMessage } from '../../types/socket.types';

export interface ChatRoom {
  messages: ChatMessage[];
  maxMessages: number;
  createdAt: Date;
  lastMessageAt: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // 방별 채팅 기록 (메모리 저장소)
  private chatRooms: Map<string, ChatRoom> = new Map();

  // 기본 최대 메시지 수
  private readonly DEFAULT_MAX_MESSAGES = 100;

  /**
   * 채팅방 생성 또는 기존 방 반환
   */
  private createOrGetChatRoom(
    roomId: string,
    maxMessages: number = this.DEFAULT_MAX_MESSAGES,
  ): ChatRoom {
    if (!this.chatRooms.has(roomId)) {
      const newChatRoom: ChatRoom = {
        messages: [],
        maxMessages,
        createdAt: new Date(),
        lastMessageAt: new Date(),
      };
      this.chatRooms.set(roomId, newChatRoom);
      this.logger.log(`Created new chat room: ${roomId}`);
    }
    return this.chatRooms.get(roomId)!;
  }

  /**
   * 메시지 추가
   */
  addMessage(roomId: string, message: ChatMessage): boolean {
    const chatRoom = this.createOrGetChatRoom(roomId);

    // 메시지 추가
    chatRoom.messages.push(message);
    chatRoom.lastMessageAt = new Date();

    // 최대 메시지 수 초과 시 오래된 메시지 제거
    if (chatRoom.messages.length > chatRoom.maxMessages) {
      const removedCount = chatRoom.messages.length - chatRoom.maxMessages;
      chatRoom.messages = chatRoom.messages.slice(removedCount);
      this.logger.log(
        `Removed ${removedCount} old messages from room ${roomId}`,
      );
    }

    this.logger.log(`Message added to room ${roomId} from ${message.username}`);
    return true;
  }

  /**
   * 방의 모든 메시지 반환
   */
  getMessages(roomId: string): ChatMessage[] {
    const chatRoom = this.chatRooms.get(roomId);
    return chatRoom?.messages || [];
  }

  /**
   * 특정 단계의 메시지만 반환
   */
  getMessagesByPhase(roomId: string, phase: number): ChatMessage[] {
    const messages = this.getMessages(roomId);
    return messages.filter((message) => message.phase === phase);
  }

  /**
   * 최근 N개 메시지 반환
   */
  getRecentMessages(roomId: string, count: number): ChatMessage[] {
    const messages = this.getMessages(roomId);
    return messages.slice(-count);
  }

  /**
   * 특정 사용자의 메시지 반환
   */
  getMessagesByUser(roomId: string, userId: string): ChatMessage[] {
    const messages = this.getMessages(roomId);
    return messages.filter((message) => message.senderId === userId);
  }

  /**
   * 시간 범위 내 메시지 반환
   */
  getMessagesByTimeRange(
    roomId: string,
    startTime: number,
    endTime: number,
  ): ChatMessage[] {
    const messages = this.getMessages(roomId);
    return messages.filter(
      (message) =>
        message.timestamp >= startTime && message.timestamp <= endTime,
    );
  }

  /**
   * 메시지 검색 (키워드 기반)
   */
  searchMessages(roomId: string, keyword: string): ChatMessage[] {
    const messages = this.getMessages(roomId);
    const lowerKeyword = keyword.toLowerCase();
    return messages.filter(
      (message) =>
        message.message.toLowerCase().includes(lowerKeyword) ||
        message.username.toLowerCase().includes(lowerKeyword),
    );
  }

  /**
   * 채팅방 통계 정보 반환
   */
  getChatRoomStats(roomId: string): {
    messageCount: number;
    userCount: number;
    createdAt: Date;
    lastMessageAt: Date;
  } | null {
    const chatRoom = this.chatRooms.get(roomId);
    if (!chatRoom) {
      return null;
    }

    // 고유 사용자 수 계산
    const uniqueUsers = new Set(chatRoom.messages.map((msg) => msg.senderId));

    return {
      messageCount: chatRoom.messages.length,
      userCount: uniqueUsers.size,
      createdAt: chatRoom.createdAt,
      lastMessageAt: chatRoom.lastMessageAt,
    };
  }

  /**
   * 채팅방 삭제
   */
  deleteChatRoom(roomId: string): boolean {
    const deleted = this.chatRooms.delete(roomId);
    if (deleted) {
      this.logger.log(`Chat room deleted: ${roomId}`);
    }
    return deleted;
  }

  /**
   * 채팅방 존재 여부 확인
   */
  chatRoomExists(roomId: string): boolean {
    return this.chatRooms.has(roomId);
  }

  /**
   * 모든 채팅방 목록 반환 (디버깅용)
   */
  getAllChatRooms(): Map<string, ChatRoom> {
    return this.chatRooms;
  }

  /**
   * 비활성 채팅방 정리 (메모리 관리용)
   */
  cleanupInactiveChatRooms(maxInactiveMinutes: number = 120): number {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxInactiveMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [roomId, chatRoom] of this.chatRooms.entries()) {
      if (chatRoom.lastMessageAt < cutoffTime) {
        this.chatRooms.delete(roomId);
        cleanedCount++;
        this.logger.log(`Cleaned up inactive chat room: ${roomId}`);
      }
    }

    return cleanedCount;
  }

  /**
   * 메시지 수 제한 설정
   */
  setMaxMessages(roomId: string, maxMessages: number): boolean {
    const chatRoom = this.chatRooms.get(roomId);
    if (!chatRoom) {
      return false;
    }

    chatRoom.maxMessages = maxMessages;

    // 현재 메시지 수가 새로운 제한을 초과하면 오래된 메시지 제거
    if (chatRoom.messages.length > maxMessages) {
      const removedCount = chatRoom.messages.length - maxMessages;
      chatRoom.messages = chatRoom.messages.slice(removedCount);
      this.logger.log(
        `Removed ${removedCount} messages due to new limit in room ${roomId}`,
      );
    }

    return true;
  }

  /**
   * 메시지 삭제 (관리자 기능)
   */
  deleteMessage(roomId: string, messageIndex: number): boolean {
    const chatRoom = this.chatRooms.get(roomId);
    if (
      !chatRoom ||
      messageIndex < 0 ||
      messageIndex >= chatRoom.messages.length
    ) {
      return false;
    }

    const deletedMessage = chatRoom.messages.splice(messageIndex, 1)[0];
    this.logger.log(
      `Message deleted from room ${roomId}: ${deletedMessage.message}`,
    );
    return true;
  }
}
