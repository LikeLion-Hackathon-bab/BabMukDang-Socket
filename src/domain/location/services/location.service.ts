import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from '../../common/base.service';
import { Id } from 'src/domain/common/types';
import { LocationCandidateDto } from 'src/domain/location/dto/request.dto';
import { LocationCandidate, LocationStore } from '../types/location.type';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';
import { RoomStoreService } from 'src/domain/room/services/room.service';

@Injectable()
export class LocationService extends BaseService<LocationStore> {
  private readonly logger = new Logger(LocationService.name);
  constructor(readonly roomStore: RoomStoreService) {
    super(roomStore);
    const emitter = this.roomStore.getEventEmitter();

    emitter.on(
      'request-final-state',
      ({
        roomId,
        stage,
      }: {
        roomId: string;
        stage: AnnouncementStage | InvitationStage;
      }) => {
        if (stage !== 'location-vote') return;
        const finalLocation = this.calculateFinalLocation(roomId);
        const finalState = this.roomStore.getFinalState(roomId);
        if (!finalState) return;
        finalState.location = finalLocation;
      },
    );
    emitter.on(
      'request-initial-state',
      ({ roomId, stage }: { roomId: string; stage: InvitationStage }) => {
        if (stage !== 'location') return;
        this.logger.log(`Initialized location state for room ${roomId}`);
        emitter.emit('initial-state-response', {
          roomId,
          stage: 'location',
          initialState: this.serializeLocationStore(
            this.getStepState(roomId) ?? this.createInitialState(),
          ),
        });
      },
    );
    emitter.on(
      'request-initial-state',
      ({ roomId, stage }: { roomId: string; stage: InvitationStage }) => {
        if (stage !== 'location-vote') return;
        this.logger.log(`Initialized location vote state for room ${roomId}`);
        emitter.emit('initial-state-response', {
          roomId,
          stage: 'location-vote',
          initialState: this.serializeLocationStore(
            this.getStepState(roomId) ?? this.createInitialState(),
          ),
        });
      },
    );
  }
  /**
   * Step 2 상태를 가져옵니다
   */
  getStepState(roomId: string): LocationStore | undefined {
    const room = this.roomStore.getRoom(roomId);
    if (!room || room.location === undefined) return undefined;

    // Step 2 상태가 없으면 초기화
    if (!room.location) {
      return this.initializeStep(roomId);
    }

    return room.location;
  }

  /**
   * Step 2 상태를 업데이트합니다
   */
  updateStepState(
    roomId: string,
    updateFn: (state: LocationStore) => void,
  ): LocationStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }

    // Step 2 상태가 없으면 초기화
    if (room.location === undefined) {
      room.location = this.createInitialState();
    }

    // 상태 업데이트
    updateFn(room.location);
    // 버전 증가
    this.bumpVersion(roomId);

    return room.location;
  }

  /**
   * 단계 전환을 검증합니다
   */
  validateTransition(
    roomId: string,
    fromStage: AnnouncementStage | InvitationStage,
    toStage: AnnouncementStage | InvitationStage,
  ): boolean {
    if (fromStage !== 'location') return false;
    if (toStage !== 'location-vote') return false;

    // Step 2에서 Step 3로 전환하기 위한 조건 검증
    const state = this.getStepState(roomId);
    if (!state) return false;

    // 최소 후보 수 확인
    if (state.candidates.size < 1) {
      return false;
    }

    return true;
  }

  /**
   * Step 2 상태를 초기화합니다
   */
  initializeStep(roomId: string): LocationStore {
    const room = this.roomStore.getRoom(roomId);
    if (!room) {
      this.throwError('Room not found', roomId);
    }

    const initialState = this.createInitialState();
    room.location = initialState;

    this.logger.log(`Initialized Step 2 state for room ${roomId}`);
    return initialState;
  }

  /**
   * Step 2 상태를 리셋합니다
   */
  resetStep(roomId: string): void {
    const room = this.roomStore.getRoom(roomId);
    if (room && room.location) {
      room.location = this.createInitialState();
      this.bumpVersion(roomId);
      this.logger.log(`Reset Step 2 state for room ${roomId}`);
    }
  }

  /**
   * Step 2 상태가 유효한지 검증합니다
   */
  validateStepState(roomId: string): boolean {
    const state = this.getStepState(roomId);
    if (!state) return false;

    // 기본 유효성 검사
    if (state.maxCandidates < 1 || state.maxCandidates > 50) return false;

    // 후보 수와 최대 후보 수 검사
    if (state.candidates.size > state.maxCandidates) return false;

    return true;
  }

  /**
   * Step 2 비즈니스 로직을 검증합니다
   */
  validateBusinessRules(roomId: string, action: string, payload: any): boolean {
    switch (action) {
      case 'ADD_CANDIDATE':
        return this.validateAddCandidate(roomId, payload);
      case 'REMOVE_CANDIDATE':
        return this.validateRemoveCandidate(roomId, payload);
      case 'VOTE_CANDIDATE':
        return this.validateVoteCandidate(roomId, payload);
      case 'SELECT_CANDIDATE':
        return this.validateSelectCandidate(roomId, payload);
      default:
        return false;
    }
  }

  /**
   * 후보 추가를 검증합니다
   */
  private validateAddCandidate(roomId: string, payload: any): boolean {
    if (!payload.placeName || typeof payload.placeName !== 'string')
      return false;
    if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number')
      return false;
    if (payload.lat < -90 || payload.lat > 90) return false;
    if (payload.lng < -180 || payload.lng > 180) return false;

    const state = this.getStepState(roomId);
    if (!state) return false;

    // 최대 후보 수 확인
    if (state.candidates.size >= state.maxCandidates) return false;

    return true;
  }

  /**
   * 후보 제거를 검증합니다
   */
  private validateRemoveCandidate(roomId: string, payload: any): boolean {
    if (!payload.candidateId || typeof payload.candidateId !== 'string')
      return false;

    const state = this.getStepState(roomId);
    if (!state) return false;

    // 후보가 존재하는지 확인
    if (!state.candidates.has(payload.candidateId)) return false;

    return true;
  }

  /**
   * 후보 투표를 검증합니다
   */
  private validateVoteCandidate(roomId: string, payload: any): boolean {
    if (!payload.candidateId || typeof payload.candidateId !== 'string')
      return false;
    if (!payload.userId || typeof payload.userId !== 'string') return false;

    const state = this.getStepState(roomId);
    if (!state) return false;

    // 후보가 존재하는지 확인
    if (!state.candidates.has(payload.candidateId)) return false;

    // 사용자가 방에 있는지 확인
    if (!this.isUserInRoom(roomId, payload.userId)) return false;

    return true;
  }

  /**
   * 후보 선택을 검증합니다
   */
  private validateSelectCandidate(roomId: string, payload: any): boolean {
    if (!payload.candidateId || typeof payload.candidateId !== 'string')
      return false;

    const state = this.getStepState(roomId);
    if (!state) return false;

    // 후보가 존재하는지 확인
    if (!state.candidates.has(payload.candidateId)) return false;

    return true;
  }

  private serializeLocationStore(store: LocationStore): {
    candidates: LocationCandidateDto[];
    votes: Set<Id>[];
    maxCandidates: number;
  } {
    return {
      candidates: Array.from(store.candidates.values()),
      votes: Array.from(store.votes.values()),
      maxCandidates: store.maxCandidates,
    };
  }

  /**
   * 초기 상태를 생성합니다
   */
  private createInitialState(): LocationStore {
    return {
      candidates: new Map<Id, LocationCandidateDto>(),
      votes: new Map<Id, Set<Id>>(),
      maxCandidates: 20,
    };
  }

  /**
   * 후보를 추가합니다
   */
  addCandidate({
    roomId,
    placeName,
    lat,
    lng,
    address,
    userId,
  }: {
    roomId: string;
    placeName: string;
    lat: number;
    lng: number;
    address: string;
    userId: string;
  }): boolean {
    const state = this.getStepState(roomId);

    // 동일한 userId가 이미 후보를 2개 추가했다면, 가장 새로운 후보를 삭제하고 새로 들어온 후보로 대체
    if (state) {
      const userCandidates = Array.from(state.candidates.entries()).filter(
        ([, candidate]: [string, any]) => candidate.userId === userId,
      );

      if (userCandidates.length >= 2) {
        // 가장 새로운 후보를 찾기
        const [newestCandidateId] = userCandidates[userCandidates.length - 1];
        state.candidates.delete(newestCandidateId);
        state.votes.delete(newestCandidateId);
      }
    }
    const candidateId = Date.now().toString();

    const candidate: LocationCandidateDto & { userId: string } = {
      id: candidateId,
      userId,
      placeName,
      lat,
      lng,
      address,
    };
    this.updateStepState(roomId, (state) => {
      state.candidates.set(candidateId, candidate);
      state.votes.set(candidateId, new Set<Id>());
    });

    this.logger.log(
      `Added candidate ${candidateId} (${placeName}) to room ${roomId}`,
    );
    return true;
  }

  /**
   * 후보를 제거합니다
   */
  removeCandidate(roomId: string, candidateId: Id): boolean {
    if (!this.validateRemoveCandidate(roomId, { candidateId })) {
      return false;
    }

    this.updateStepState(roomId, (state) => {
      state.candidates.delete(candidateId);
      state.votes.delete(candidateId);
    });

    this.logger.log(`Removed candidate ${candidateId} from room ${roomId}`);
    return true;
  }

  /**
   * 유저가 투표했던 후보를 삭제하고, 다시 투표합니다
   */
  voteCandidate(roomId: string, candidateId: Id, userId: Id): boolean {
    // if (!this.validateVoteCandidate(roomId, { candidateId, userId })) {
    //   return false;
    // }

    // 현재 투표한 후보를 삭제합니다
    this.unvoteCandidate(roomId, userId);
    this.updateStepState(roomId, (state) => {
      state.votes.get(candidateId)?.add(userId);
    });

    this.logger.log(
      `User ${userId} voted for candidate ${candidateId} in room ${roomId}`,
    );
    return true;
  }

  /**
   * 후보 투표를 취소합니다
   */
  unvoteCandidate(roomId: string, userId: Id): boolean {
    const state = this.getStepState(roomId);
    if (!state) return false;

    state.votes.forEach((userSet) => {
      if (userSet.has(userId)) {
        userSet.delete(userId);
      }
    });

    this.logger.log(`Unselected candidate in room ${roomId}`);
    return true;
  }

  /**
   * 후보 목록을 가져옵니다
   */
  getCandidates(roomId: string): LocationCandidateDto[] {
    const state = this.getStepState(roomId);
    return state ? Array.from(state.candidates.values()) : [];
  }

  /**
   * 특정 후보를 가져옵니다
   */
  getCandidate(
    roomId: string,
    candidateId: Id,
  ): LocationCandidateDto | undefined {
    const state = this.getStepState(roomId);
    return state?.candidates.get(candidateId);
  }

  /**
   * 후보의 투표 수를 가져옵니다
   */
  getCandidateVoteCount(roomId: string, candidateId: Id): number {
    const state = this.getStepState(roomId);
    const votes = state?.votes.get(candidateId);
    return votes ? votes.size : 0;
  }

  /**
   * 최종 후보를 계산합니다
   */
  calculateFinalLocation(roomId: string): LocationCandidate | undefined {
    const state = this.getStepState(roomId);
    if (!state) return undefined;
    const room = this.roomStore.getRoom(roomId);
    if (!room) return undefined;
    let finalLocation: LocationCandidate | undefined;
    let maxVotes = 0;
    state.candidates.forEach((candidate) => {
      const votes = state.votes.get(candidate.id);
      if (votes && votes.size > maxVotes) {
        maxVotes = votes.size;
        finalLocation = candidate;
      }
    });
    return finalLocation;
  }

  /**
   * 사용자가 특정 후보에 투표했는지 확인합니다
   */
  hasUserVoted(roomId: string, candidateId: Id, userId: Id): boolean {
    const state = this.getStepState(roomId);
    const votes = state?.votes.get(candidateId);
    return votes ? votes.has(userId) : false;
  }

  /**
   * 최대 후보 수를 설정합니다
   */
  setMaxCandidates(roomId: string, maxCandidates: number): boolean {
    if (maxCandidates < 1 || maxCandidates > 50) {
      return false;
    }

    this.updateStepState(roomId, (state) => {
      state.maxCandidates = maxCandidates;
    });

    this.logger.log(
      `Set max candidates to ${maxCandidates} for room ${roomId}`,
    );
    return true;
  }

  /**
   * 후보의 투표자 목록을 가져옵니다
   */
  getCandidateVoters(roomId: string, candidateId: Id): Id[] {
    const state = this.getStepState(roomId);
    const votes = state?.votes.get(candidateId);
    return votes ? Array.from(votes) : [];
  }

  /**
   * 사용자가 투표한 후보들을 가져옵니다
   */
  getUserVotes(roomId: string, userId: Id): Id[] {
    const state = this.getStepState(roomId);
    if (!state) return [];

    const userVotes: Id[] = [];
    state.votes.forEach((votes, candidateId) => {
      if (votes.has(userId)) {
        userVotes.push(candidateId);
      }
    });

    return userVotes;
  }

  /**
   *  투표 상태를 가져옵니다
   */
  getVoteStates(roomId: string): Map<Id, Set<Id>> {
    const state = this.getStepState(roomId);
    return state?.votes ?? new Map<Id, Set<Id>>();
  }

  getSerializedVoteStates(roomId: string): Record<Id, Id[]> {
    const state = this.getStepState(roomId);
    return Object.fromEntries(
      Array.from(state?.votes.entries() ?? []).map(([candidateId, votes]) => [
        candidateId,
        Array.from(votes),
      ]),
    );
  }
}
