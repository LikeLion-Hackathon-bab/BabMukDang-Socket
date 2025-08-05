import { Injectable, Logger } from '@nestjs/common';
import { UserInfo, PhaseDataBroadcastPayload } from '../types';

export interface RoomState {
  users: Map<string, UserInfo>;
  phase: number;
  phaseData: PhaseDataBroadcastPayload['data'];
  createdAt: Date;
  lastActivity: Date;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  // 방별 상태 관리 (메모리 저장소)
  private rooms: Map<string, RoomState> = new Map();

  // 사용자별 방 매핑 (socketId -> roomId)
  private userToRoom: Map<string, string> = new Map();

  /**
   * 방 생성 또는 기존 방 반환
   */
  createOrGetRoom(roomId: string): RoomState {
    if (!this.rooms.has(roomId)) {
      const newRoom: RoomState = {
        users: new Map(),
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
   * 사용자를 방에 추가
   */
  addUserToRoom(roomId: string, socketId: string, userInfo: UserInfo): boolean {
    const room = this.createOrGetRoom(roomId);

    // 기존 방에서 사용자 제거 (중복 방지)
    this.removeUserFromAnyRoom(socketId);

    // 새 방에 사용자 추가
    room.users.set(socketId, userInfo);
    this.userToRoom.set(socketId, roomId);
    room.lastActivity = new Date();

    this.logger.log(
      `User ${userInfo.nickname} (${userInfo.userId}) added to room ${roomId}`,
    );
    return true;
  }

  /**
   * 사용자를 방에서 제거
   */
  removeUserFromRoom(roomId: string, socketId: string): UserInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    const userInfo = room.users.get(socketId);
    if (!userInfo) {
      return null;
    }

    room.users.delete(socketId);
    this.userToRoom.delete(socketId);
    room.lastActivity = new Date();

    this.logger.log(
      `User ${userInfo.nickname} (${userInfo.userId}) removed from room ${roomId}`,
    );

    // 방이 비어있으면 방 삭제
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
      this.logger.log(`Room ${roomId} deleted (no users remaining)`);
    }

    return userInfo;
  }

  /**
   * 사용자를 현재 방에서 제거 (방 ID 모를 때)
   */
  removeUserFromAnyRoom(socketId: string): UserInfo | null {
    const roomId = this.userToRoom.get(socketId);
    if (!roomId) {
      return null;
    }
    return this.removeUserFromRoom(roomId, socketId);
  }

  /**
   * 방의 모든 사용자 목록 반환
   */
  getRoomUsers(roomId: string): UserInfo[] {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }
    return Array.from(room.users.values());
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
   * 방 존재 여부 확인
   */
  roomExists(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /**
   * 사용자가 방에 있는지 확인
   */
  isUserInRoom(roomId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId);
    return room?.users.has(socketId) || false;
  }

  /**
   * 사용자의 현재 방 ID 반환
   */
  getUserRoomId(socketId: string): string | null {
    return this.userToRoom.get(socketId) || null;
  }

  /**
   * 모든 방 목록 반환 (디버깅용)
   */
  getAllRooms(): Map<string, RoomState> {
    return this.rooms;
  }

  /**
   * 방 통계 정보 반환
   */
  getRoomStats(
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
      userCount: room.users.size,
      phase: room.phase,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
    };
  }

  /**
   * 비활성 방 정리 (메모리 관리용)
   */
  cleanupInactiveRooms(maxInactiveMinutes: number = 60): number {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxInactiveMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.lastActivity < cutoffTime && room.users.size === 0) {
        this.rooms.delete(roomId);
        cleanedCount++;
        this.logger.log(`Cleaned up inactive room: ${roomId}`);
      }
    }

    return cleanedCount;
  }
}
