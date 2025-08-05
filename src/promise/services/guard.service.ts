import { Injectable, Logger } from '@nestjs/common';
import { UserInfo, PhaseDataBroadcastPayload } from '../types';

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

export interface DataOwnershipCheck {
  isOwner: boolean;
  ownerId?: string;
  reason?: string;
}

@Injectable()
export class GuardService {
  private readonly logger = new Logger(GuardService.name);

  /**
   * 사용자가 방에 있는지 확인
   */
  canAccessRoom(roomId: string, socketId: string, roomService: any): boolean {
    return roomService.isUserInRoom(roomId, socketId);
  }

  /**
   * 사용자가 본인의 데이터만 수정할 수 있는지 확인
   */
  canModifyOwnData(
    socketId: string,
    userId: string,
    roomService: any,
  ): PermissionCheck {
    const roomId = roomService.getUserRoomId(socketId);
    if (!roomId) {
      return {
        allowed: false,
        reason: 'User is not in any room',
      };
    }

    const room = roomService.createOrGetRoom(roomId);
    const userInfo = room.users.get(socketId);

    if (!userInfo) {
      return {
        allowed: false,
        reason: 'User not found in room',
      };
    }

    if (userInfo.userId !== userId) {
      return {
        allowed: false,
        reason: 'User can only modify their own data',
      };
    }

    return {
      allowed: true,
    };
  }

  /**
   * 단계 데이터 수정 권한 확인
   */
  canModifyPhaseData(
    socketId: string,
    userId: string,
    roomService: any,
  ): PermissionCheck {
    return this.canModifyOwnData(socketId, userId, roomService);
  }

  /**
   * 채팅 메시지 전송 권한 확인
   */
  canSendChatMessage(
    socketId: string,
    senderId: string,
    roomService: any,
  ): PermissionCheck {
    return this.canModifyOwnData(socketId, senderId, roomService);
  }

  /**
   * 단계 변경 요청 권한 확인
   */
  canRequestPhaseChange(
    socketId: string,
    requesterId: string,
    roomService: any,
  ): PermissionCheck {
    return this.canModifyOwnData(socketId, requesterId, roomService);
  }

  /**
   * 데이터 소유권 확인
   */
  checkDataOwnership(data: any, userId: string): DataOwnershipCheck {
    if (!data || typeof data !== 'object') {
      return {
        isOwner: false,
        reason: 'Invalid data format',
      };
    }

    // 데이터에 userId 필드가 있는지 확인
    if (data.userId && data.userId !== userId) {
      return {
        isOwner: false,
        ownerId: data.userId,
        reason: 'Data belongs to another user',
      };
    }

    return {
      isOwner: true,
    };
  }

  /**
   * 단계별 데이터 소유권 확인
   */
  checkPhaseDataOwnership(
    phaseData: Partial<PhaseDataBroadcastPayload['data']>,
    userId: string,
  ): DataOwnershipCheck[] {
    const checks: DataOwnershipCheck[] = [];

    // locationSelection 확인
    if (phaseData.locationSelection) {
      for (const item of phaseData.locationSelection) {
        checks.push(this.checkDataOwnership(item, userId));
      }
    }

    // recentMenus 확인
    if (phaseData.recentMenus) {
      for (const item of phaseData.recentMenus) {
        checks.push(this.checkDataOwnership(item, userId));
      }
    }

    // wantedMenus 확인
    if (phaseData.wantedMenus) {
      for (const item of phaseData.wantedMenus) {
        checks.push(this.checkDataOwnership(item, userId));
      }
    }

    // finalPlace 확인
    if (phaseData.finalPlace) {
      for (const item of phaseData.finalPlace) {
        checks.push(this.checkDataOwnership(item, userId));
      }
    }

    return checks;
  }

  /**
   * 사용자 인증 상태 확인 (향후 JWT 토큰 검증 등으로 확장)
   */
  isUserAuthenticated(socketId: string, roomService: any): boolean {
    const roomId = roomService.getUserRoomId(socketId);
    return roomId !== null;
  }

  /**
   * 방 참가 권한 확인
   */
  canJoinRoom(
    roomId: string,
    userInfo: UserInfo,
    roomService: any,
  ): PermissionCheck {
    // 기본적으로 모든 사용자가 방에 참가할 수 있음
    // 향후 방별 권한 설정으로 확장 가능

    if (!userInfo.userId || !userInfo.nickname) {
      return {
        allowed: false,
        reason: 'Invalid user information',
      };
    }

    // 닉네임 길이 제한
    if (userInfo.nickname.length < 1 || userInfo.nickname.length > 20) {
      return {
        allowed: false,
        reason: 'Nickname must be between 1 and 20 characters',
      };
    }

    // 방 ID 유효성 검사
    if (!roomId || roomId.length === 0) {
      return {
        allowed: false,
        reason: 'Invalid room ID',
      };
    }

    return {
      allowed: true,
    };
  }

  /**
   * 방 퇴장 권한 확인
   */
  canLeaveRoom(
    roomId: string,
    socketId: string,
    roomService: any,
  ): PermissionCheck {
    if (!this.canAccessRoom(roomId, socketId, roomService)) {
      return {
        allowed: false,
        reason: 'User is not in the room',
      };
    }

    return {
      allowed: true,
    };
  }

  /**
   * 관리자 권한 확인 (향후 확장용)
   */
  isAdmin(userId: string): boolean {
    // 현재는 모든 사용자가 관리자 권한을 가짐
    // 향후 실제 관리자 목록과 비교하도록 수정
    return true;
  }

  /**
   * 방 관리 권한 확인
   */
  canManageRoom(
    roomId: string,
    userId: string,
    roomService: any,
  ): PermissionCheck {
    // 현재는 방에 있는 모든 사용자가 방을 관리할 수 있음
    // 향후 방 생성자나 관리자만 관리할 수 있도록 수정 가능

    const room = roomService.createOrGetRoom(roomId);
    const userInRoom = Array.from(room.users.values()).some(
      (user: UserInfo) => user.userId === userId,
    );

    if (!userInRoom) {
      return {
        allowed: false,
        reason: 'User is not in the room',
      };
    }

    return {
      allowed: true,
    };
  }

  /**
   * 데이터 수정 로그 기록
   */
  logDataModification(
    userId: string,
    roomId: string,
    dataType: string,
    action: string,
  ): void {
    this.logger.log(
      `Data modification: User ${userId} ${action} ${dataType} in room ${roomId}`,
    );
  }

  /**
   * 권한 거부 로그 기록
   */
  logPermissionDenied(
    userId: string,
    roomId: string,
    action: string,
    reason: string,
  ): void {
    this.logger.warn(
      `Permission denied: User ${userId} attempted ${action} in room ${roomId}. Reason: ${reason}`,
    );
  }
}
