import { Injectable, Logger } from '@nestjs/common';
import { PhaseDataBroadcastPayload } from '../types';

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
   * 데이터 소유권 확인 (유틸리티 함수)
   */
  // checkDataOwnership(data: any, userId: string): DataOwnershipCheck {
  //   if (!data || typeof data !== 'object') {
  //     return {
  //       isOwner: false,
  //       reason: 'Invalid data format',
  //     };
  //   }

  //   // 데이터에 userId 필드가 있는지 확인
  //   if (
  //     data.userId &&
  //     typeof data.userId === 'string' &&
  //     data.userId !== userId
  //   ) {
  //     return {
  //       isOwner: false,
  //       ownerId: data.userId,
  //       reason: 'Data belongs to another user',
  //     };
  //   }

  //   return {
  //     isOwner: true,
  //   };
  // }

  /**
   * 단계별 데이터 소유권 확인 (유틸리티 함수)
   */
  // checkPhaseDataOwnership(
  //   phaseData: Partial<PhaseDataBroadcastPayload['data']>,
  //   userId: string,
  // ): DataOwnershipCheck[] {
  //   const checks: DataOwnershipCheck[] = [];

  //   // locationSelection 확인
  //   if (phaseData.locationSelection) {
  //     for (const item of phaseData.locationSelection) {
  //       checks.push(this.checkDataOwnership(item, userId));
  //     }
  //   }

  //   // recentMenus 확인
  //   if (phaseData.recentMenus) {
  //     for (const item of phaseData.recentMenus) {
  //       checks.push(this.checkDataOwnership(item, userId));
  //     }
  //   }

  //   // wantedMenus 확인
  //   if (phaseData.wantedMenus) {
  //     for (const item of phaseData.wantedMenus) {
  //       checks.push(this.checkDataOwnership(item, userId));
  //     }
  //   }

  //   // finalPlace 확인
  //   if (phaseData.finalPlace) {
  //     for (const item of phaseData.finalPlace) {
  //       checks.push(this.checkDataOwnership(item, userId));
  //     }
  //   }

  //   return checks;
  // }

  /**
   * 관리자 권한 확인 (향후 확장용)
   */
  isAdmin(): boolean {
    // 현재는 모든 사용자가 관리자 권한을 가짐
    // 향후 실제 관리자 목록과 비교하도록 수정
    return true;
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
