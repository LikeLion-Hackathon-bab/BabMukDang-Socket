import { Injectable, Logger } from '@nestjs/common';
import type { UserInfo } from '../../types/user.types';
import type {
  PhaseDataBroadcastPayload,
  PhaseChangeBroadcast,
} from '../../types/phase.types';

export interface PhaseConfig {
  maxPhase: number;
  phaseNames: Record<number, string>;
  phaseRequirements: Record<number, string[]>;
}

export interface PhaseTransition {
  fromPhase: number;
  toPhase: number;
  requester: UserInfo;
  timestamp: Date;
  approved: boolean;
}

@Injectable()
export class PhaseService {
  private readonly logger = new Logger(PhaseService.name);

  // 방별 단계 전환 기록
  private phaseTransitions: Map<string, PhaseTransition[]> = new Map();

  // 기본 단계 설정
  private readonly DEFAULT_PHASE_CONFIG: PhaseConfig = {
    maxPhase: 4,
    phaseNames: {
      1: '시간 정하기',
      2: '장소 선택',
      3: '메뉴 선택',
      4: '최종 확인',
    },
    phaseRequirements: {
      1: ['timeSelection'],
      2: ['locationSelection'],
      3: ['menuSelection'],
      4: ['finalConfirmation'],
    },
  };

  /**
   * 단계 전환 요청 처리
   */
  requestPhaseChange(
    roomId: string,
    requester: UserInfo,
    targetPhase: number,
    currentPhase: number,
  ): { success: boolean; broadcast: PhaseChangeBroadcast; reason?: string } {
    // 유효한 단계인지 확인
    if (targetPhase < 1 || targetPhase > this.DEFAULT_PHASE_CONFIG.maxPhase) {
      return {
        success: false,
        broadcast: {},
        reason: `Invalid phase: ${targetPhase}. Must be between 1 and ${this.DEFAULT_PHASE_CONFIG.maxPhase}`,
      };
    }

    // 현재 단계와 같은 단계로의 전환은 무시
    if (targetPhase === currentPhase) {
      return {
        success: false,
        broadcast: {},
        reason: `Already in phase ${currentPhase}`,
      };
    }

    // 단계 전환 규칙 검증
    const transitionValid = this.validatePhaseTransition(
      currentPhase,
      targetPhase,
    );
    if (!transitionValid) {
      return {
        success: false,
        broadcast: {},
        reason: `Invalid transition from phase ${currentPhase} to ${targetPhase}`,
      };
    }

    // 단계 전환 기록
    this.recordPhaseTransition(roomId, {
      fromPhase: currentPhase,
      toPhase: targetPhase,
      requester,
      timestamp: new Date(),
      approved: true,
    });

    // 브로드캐스트 데이터 생성
    const broadcast: PhaseChangeBroadcast = {
      next: [requester],
    };

    this.logger.log(
      `Phase change approved: ${currentPhase} -> ${targetPhase} by ${requester.nickname} in room ${roomId}`,
    );

    return {
      success: true,
      broadcast,
    };
  }

  /**
   * 단계 전환 규칙 검증
   */
  private validatePhaseTransition(fromPhase: number, toPhase: number): boolean {
    // 순차적 전환만 허용 (1 -> 2 -> 3 -> 4)
    if (toPhase !== fromPhase + 1 && toPhase !== fromPhase - 1) {
      return false;
    }

    // 특별한 규칙들 (필요시 추가)
    // 예: 특정 단계에서는 되돌아갈 수 없음
    if (fromPhase === 4 && toPhase === 3) {
      return false; // 최종 확인 단계에서는 되돌아갈 수 없음
    }

    return true;
  }

  /**
   * 단계 전환 기록
   */
  private recordPhaseTransition(
    roomId: string,
    transition: PhaseTransition,
  ): void {
    if (!this.phaseTransitions.has(roomId)) {
      this.phaseTransitions.set(roomId, []);
    }

    this.phaseTransitions.get(roomId)!.push(transition);

    // 최대 50개 기록만 유지
    const transitions = this.phaseTransitions.get(roomId)!;
    if (transitions.length > 50) {
      transitions.shift();
    }
  }

  /**
   * 단계별 데이터 검증
   */
  validatePhaseData(
    phase: number,
    data: Partial<PhaseDataBroadcastPayload['data']>,
  ): {
    valid: boolean;
    missingFields: string[];
  } {
    const requirements =
      this.DEFAULT_PHASE_CONFIG.phaseRequirements[phase] || [];
    const missingFields: string[] = [];

    for (const requirement of requirements) {
      if (!data[requirement as keyof PhaseDataBroadcastPayload['data']]) {
        missingFields.push(requirement);
      }
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * 단계 이름 반환
   */
  getPhaseName(phase: number): string {
    return this.DEFAULT_PHASE_CONFIG.phaseNames[phase] || `Phase ${phase}`;
  }

  /**
   * 최대 단계 수 반환
   */
  getMaxPhase(): number {
    return this.DEFAULT_PHASE_CONFIG.maxPhase;
  }

  /**
   * 단계별 요구사항 반환
   */
  getPhaseRequirements(phase: number): string[] {
    return this.DEFAULT_PHASE_CONFIG.phaseRequirements[phase] || [];
  }

  /**
   * 방의 단계 전환 기록 반환
   */
  getPhaseTransitions(roomId: string): PhaseTransition[] {
    return this.phaseTransitions.get(roomId) || [];
  }

  /**
   * 최근 단계 전환 반환
   */
  getLastPhaseTransition(roomId: string): PhaseTransition | null {
    const transitions = this.getPhaseTransitions(roomId);
    return transitions.length > 0 ? transitions[transitions.length - 1] : null;
  }

  /**
   * 단계 전환 통계 반환
   */
  getPhaseTransitionStats(roomId: string): {
    totalTransitions: number;
    phaseCounts: Record<number, number>;
    lastTransition: Date | null;
  } {
    const transitions = this.getPhaseTransitions(roomId);
    const phaseCounts: Record<number, number> = {};
    let lastTransition: Date | null = null;

    for (const transition of transitions) {
      phaseCounts[transition.toPhase] =
        (phaseCounts[transition.toPhase] || 0) + 1;
      if (!lastTransition || transition.timestamp > lastTransition) {
        lastTransition = transition.timestamp;
      }
    }

    return {
      totalTransitions: transitions.length,
      phaseCounts,
      lastTransition,
    };
  }

  /**
   * 단계별 데이터 초기화
   */
  initializePhaseData(phase: number): PhaseDataBroadcastPayload['data'] {
    const requirements = this.getPhaseRequirements(phase);
    const initialData: PhaseDataBroadcastPayload['data'] = {};

    // 각 요구사항에 대한 빈 배열 초기화
    for (const requirement of requirements) {
      switch (requirement) {
        case 'locationSelection':
          initialData.locationSelection = [];
          break;
        case 'recentMenus':
          initialData.recentMenus = [];
          break;
        case 'wantedMenus':
          initialData.wantedMenus = [];
          break;
        case 'finalPlace':
          initialData.finalPlace = [];
          break;
        default:
          // 알 수 없는 요구사항은 무시
          break;
      }
    }

    return initialData;
  }

  /**
   * 단계별 데이터 병합
   */
  mergePhaseData(
    existingData: PhaseDataBroadcastPayload['data'],
    newData: Partial<PhaseDataBroadcastPayload['data']>,
  ): PhaseDataBroadcastPayload['data'] {
    return {
      ...existingData,
      ...newData,
    };
  }

  /**
   * 단계별 데이터 검증 및 정리
   */
  sanitizePhaseData(
    data: Partial<PhaseDataBroadcastPayload['data']>,
  ): PhaseDataBroadcastPayload['data'] {
    const sanitized: PhaseDataBroadcastPayload['data'] = {};

    // locationSelection 정리
    if (data.locationSelection && Array.isArray(data.locationSelection)) {
      sanitized.locationSelection = data.locationSelection.filter(
        (item) =>
          item &&
          typeof item.userId === 'string' &&
          typeof item.nickname === 'string' &&
          typeof item.lat === 'number' &&
          typeof item.lng === 'number',
      );
    }

    // recentMenus 정리
    if (data.recentMenus && Array.isArray(data.recentMenus)) {
      sanitized.recentMenus = data.recentMenus.filter(
        (item) =>
          item &&
          typeof item.userId === 'string' &&
          typeof item.nickname === 'string' &&
          Array.isArray(item.menus),
      );
    }

    // wantedMenus 정리
    if (data.wantedMenus && Array.isArray(data.wantedMenus)) {
      sanitized.wantedMenus = data.wantedMenus.filter(
        (item) =>
          item &&
          typeof item.userId === 'string' &&
          typeof item.nickname === 'string' &&
          typeof item.selectMenu === 'string',
      );
    }

    // finalPlace 정리
    if (data.finalPlace && Array.isArray(data.finalPlace)) {
      sanitized.finalPlace = data.finalPlace.filter(
        (item) =>
          item &&
          typeof item.userId === 'string' &&
          typeof item.nickname === 'string' &&
          typeof item.selectPlace === 'string',
      );
    }

    return sanitized;
  }

  /**
   * 방의 단계 전환 기록 삭제
   */
  clearPhaseTransitions(roomId: string): boolean {
    return this.phaseTransitions.delete(roomId);
  }

  /**
   * 모든 단계 전환 기록 반환 (디버깅용)
   */
  getAllPhaseTransitions(): Map<string, PhaseTransition[]> {
    return this.phaseTransitions;
  }
}
