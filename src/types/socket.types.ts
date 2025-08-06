/**
 * Socket.IO related type definitions
 */

import { Socket } from 'socket.io';
import { UserInfo } from './user.types';

/**
 * Socket.IO socket.data의 타입 정의
 */
export interface SocketData {
  userInfo?: UserInfo;
  roomId?: string;
}

/**
 * Socket 타입 확장
 */
export interface ExtendedSocket extends Socket {
  data: SocketData;
}

/**
 * 메시지 데이터 타입 정의
 */
export interface MessageData {
  userId?: string;
  [key: string]: any;
}

/**
 * Socket event payload types
 */
export interface JoinRoomPayload {
  userId: string;
  username: string;
  roomId: string;
}

export interface LeaveRoomPayload {
  userId: string;
  username: string;
  roomId: string;
}

/**
 * Chat message interface
 */
export interface ChatMessage {
  senderId: string;
  username: string;
  message: string;
  timestamp: number;
  phase: number;
}
