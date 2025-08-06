import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import type { UserInfo, PhaseDataBroadcastPayload } from '../types';
import { ExtendedSocket } from '../types/socket.types';
import { User } from '../decorators/user.decorator';

export interface RoomState {
  phase: number;
  phaseData: PhaseDataBroadcastPayload['data'];
  createdAt: Date;
  lastActivity: Date;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  // 방별 상태 관리 (Socket.IO가 제공하지 않는 정보만 저장)
  private rooms: Map<string, RoomState> = new Map();

  /**
   * 방 생성 또는 기존 방 반환
   */
  createOrGetRoom(roomId: string): RoomState {
    if (!this.rooms.has(roomId)) {
      const newRoom: RoomState = {
        phase: 1, // 기본 단계
        phaseData: {},
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      this.rooms.set(roomId, newRoom);
      this.logger.log(`Created new room: ${roomId}`);
    }
    return this.rooms.get(roomId)!;
  }

  /**
   * 사용자를 방에 추가 (Socket.IO room membership + 사용자 정보 저장)
   */
  addUserToRoom(
    server: Server,
    roomId: string,
    socket: ExtendedSocket,
    @User() userInfo: UserInfo,
  ): boolean {
    // Socket.IO room에 참가
    socket.join(roomId);

    // 사용자 정보를 socket.data에 저장
    socket.data.userInfo = userInfo;
    socket.data.roomId = roomId;

    // 방 상태 업데이트
    const room = this.createOrGetRoom(roomId);
    room.lastActivity = new Date();

    this.logger.log(
      `User ${userInfo.nickname} (${userInfo.userId}) added to room ${roomId}`,
    );
    return true;
  }

  /**
   * 사용자를 방에서 제거
   */
  removeUserFromRoom(
    server: Server,
    roomId: string,
    socket: ExtendedSocket,
  ): UserInfo | null {
    const userInfo = socket.data.userInfo;
    if (!userInfo) {
      return null;
    }

    // Socket.IO room에서 나가기
    socket.leave(roomId);

    // socket.data 정리
    delete socket.data.userInfo;
    delete socket.data.roomId;

    // 방 상태 업데이트
    const room = this.rooms.get(roomId);
    if (room) {
      room.lastActivity = new Date();
    }

    this.logger.log(
      `User ${userInfo.nickname} (${userInfo.userId}) removed from room ${roomId}`,
    );

    // 방이 비어있으면 방 삭제
    if (this.getRoomUserCount(server, roomId) === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`Room ${roomId} deleted (no users remaining)`);
    }

    return userInfo;
  }

  /**
   * 사용자를 현재 방에서 제거 (방 ID 모를 때)
   */
  removeUserFromAnyRoom(
    server: Server,
    socket: ExtendedSocket,
  ): UserInfo | null {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return null;
    }
    return this.removeUserFromRoom(server, roomId, socket);
  }

  /**
   * 방의 모든 사용자 목록 반환 (Socket.IO adapter 활용)
   */
  getRoomUsers(server: Server, roomId: string): UserInfo[] {
    const room = server.sockets.adapter.rooms.get(roomId);
    if (!room) {
      return [];
    }

    const users: UserInfo[] = [];
    for (const socketId of room) {
      const socket = server.sockets.sockets.get(socketId) as
        | ExtendedSocket
        | undefined;
      if (socket?.data.userInfo) {
        users.push(socket.data.userInfo);
      }
    }
    return users;
  }

  /**
   * 방의 사용자 수 반환 (Socket.IO adapter 활용)
   */
  getRoomUserCount(server: Server, roomId: string): number {
    const room = server.sockets.adapter.rooms.get(roomId);
    return room?.size || 0;
  }

  /**
   * 방의 현재 단계 반환
   */
  getRoomPhase(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room?.phase || 1;
  }

  /**
   * 방의 단계 변경
   */
  setRoomPhase(roomId: string, phase: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    room.phase = phase;
    room.lastActivity = new Date();

    this.logger.log(`Room ${roomId} phase changed to ${phase}`);
    return true;
  }

  /**
   * 방의 단계 데이터 반환
   */
  getRoomPhaseData(roomId: string): PhaseDataBroadcastPayload['data'] {
    const room = this.rooms.get(roomId);
    return room?.phaseData || {};
  }

  /**
   * 방의 단계 데이터 업데이트
   */
  updateRoomPhaseData(
    roomId: string,
    phaseData: Partial<PhaseDataBroadcastPayload['data']>,
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    room.phaseData = { ...room.phaseData, ...phaseData };
    room.lastActivity = new Date();

    this.logger.log(`Room ${roomId} phase data updated`);
    return true;
  }

  /**
   * 방 존재 여부 확인 (Socket.IO adapter 활용)
   */
  roomExists(server: Server, roomId: string): boolean {
    return server.sockets.adapter.rooms.has(roomId);
  }

  /**
   * 사용자가 방에 있는지 확인 (Socket.IO adapter 활용)
   */
  isUserInRoom(server: Server, roomId: string, socketId: string): boolean {
    const room = server.sockets.adapter.rooms.get(roomId);
    return room?.has(socketId) || false;
  }

  /**
   * 사용자의 현재 방 ID 반환 (socket.data 활용)
   */
  getUserRoomId(socket: ExtendedSocket): string | null {
    return socket.data.roomId || null;
  }

  /**
   * 사용자 정보 반환 (socket.data 활용)
   */
  getUserInfo(socket: ExtendedSocket): UserInfo | null {
    return socket.data.userInfo || null;
  }

  /**
   * 모든 방 목록 반환
   */
  getAllRooms(): Map<string, RoomState> {
    return this.rooms;
  }

  /**
   * 방 통계 정보 반환
   */
  getRoomStats(
    server: Server,
    roomId: string,
  ): {
    userCount: number;
    phase: number;
    createdAt: Date;
    lastActivity: Date;
  } | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    return {
      userCount: this.getRoomUserCount(server, roomId),
      phase: room.phase,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
    };
  }

  /**
   * 비활성 방 정리 (메모리 관리용)
   */
  cleanupInactiveRooms(
    server: Server,
    maxInactiveMinutes: number = 60,
  ): number {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxInactiveMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      if (
        room.lastActivity < cutoffTime &&
        this.getRoomUserCount(server, roomId) === 0
      ) {
        this.rooms.delete(roomId);
        cleanedCount++;
        this.logger.log(`Cleaned up inactive room: ${roomId}`);
      }
    }

    return cleanedCount;
  }

  /**
   * Socket.IO room에 직접 메시지 전송
   */
  emitToRoom(server: Server, roomId: string, event: string, data: any): void {
    server.to(roomId).emit(event, data);
  }

  /**
   * 특정 사용자에게 메시지 전송
   */
  emitToUser(server: Server, socketId: string, event: string, data: any): void {
    server.to(socketId).emit(event, data);
  }
}
