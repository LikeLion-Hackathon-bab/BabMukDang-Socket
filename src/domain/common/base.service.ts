import { Injectable } from '@nestjs/common';
import { RoomStoreService } from '../room/services/room.service';
import { AnnouncementStage, InvitationStage } from './types/stage';

/**
 * 서비스의  기본 추상 클래스
 */
@Injectable()
export abstract class BaseService<T> {
  constructor(protected readonly roomStore: RoomStoreService) {}

  /**
   * 현재 단계의 상태를 가져옵니다
   */
  abstract getStepState(roomId: string): Promise<T | undefined> | T | undefined;

  /**
   * 단계 상태를 업데이트합니다
   */
  abstract updateStepState(
    roomId: string,
    updateFn: (state: T) => void,
  ): Promise<T> | T;

  /**
   * 단계 전환을 검증합니다
   */
  abstract validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean;

  /**
   * 단계 상태를 초기화합니다
   */
  abstract initializeStep(roomId: string): Promise<T> | T;

  /**
   * 단계 상태를 리셋합니다
   */
  abstract resetStep(roomId: string): Promise<void> | void;

  /**
   * 단계 상태가 유효한지 검증합니다
   */
  abstract validateStepState(roomId: string): boolean;

  /**
   * 단계별 비즈니스 로직을 검증합니다
   */
  abstract validateBusinessRules(
    roomId: string,
    action: string,
    payload: any,
  ): boolean;

  /**
   * 방의 현재 단계를 가져옵니다
   */
  protected getCurrentStage(
    roomId: string,
  ): AnnouncementStage | InvitationStage {
    return this.roomStore.getStage(roomId);
  }

  /**
   * 방의 참여자 수를 가져옵니다
   */
  protected getParticipantCount(roomId: string): number {
    return this.roomStore.getParticipantCount(roomId);
  }

  /**
   * 방의 참여자 목록을 가져옵니다
   */
  protected getParticipants(roomId: string) {
    return this.roomStore.getParticipants(roomId);
  }

  /**
   * 방의 버전을 증가시킵니다
   */
  protected bumpVersion(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    if (room) {
      this.roomStore.bump(room);
    }
  }

  /**
   * 단계 전환이 가능한지 확인합니다
   */
  // protected canTransition(
  //   fromStage: AnnouncementStage | InvitationStage,
  //   toStage: AnnouncementStage | InvitationStage,
  // ): boolean {
  //   // 기본적으로는 순차적 전환만 허용
  //   if (toStage === fromStage) return false;
  //   if (toStage < 1 || toStage > 5) return false;

  //   // 특별한 경우 (예: Step 5에서 Step 1로 돌아가기)는 하위 클래스에서 구현
  //   return Math.abs(toStage - fromStage) === 1;
  // }

  /**
   * 최소 참여자 수가 충족되었는지 확인합니다
   */
  protected hasMinimumParticipants(
    roomId: string,
    minCount: number = 2,
  ): boolean {
    return this.getParticipantCount(roomId) >= minCount;
  }

  /**
   * 사용자가 방에 참여하고 있는지 확인합니다
   */
  protected isUserInRoom(roomId: string, userId: string): boolean {
    const participants = this.getParticipants(roomId);
    return participants.has(userId);
  }

  /**
   * 에러를 로깅하고 던집니다
   */
  protected throwError(message: string, roomId?: string): never {
    const errorMessage = roomId ? `[${roomId}] ${message}` : message;
    throw new Error(errorMessage);
  }
}
