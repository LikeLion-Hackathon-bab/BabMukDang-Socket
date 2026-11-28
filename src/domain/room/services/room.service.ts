import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { ChatMessage } from 'src/domain/chat/types/chat.type';
import { ExtendedParticipant } from '../types/room.type';
import { Id } from 'src/domain/common/types';
import { WsLogger } from 'src/domain/common/logger/ws-logger.service';
import { FinalState, RoomStore } from '../types/room.type';
import {
  AnnouncementStage,
  InvitationStage,
} from 'src/domain/common/types/stage';
import { ServerService } from './server.service';
import {
  AnnouncementRequestDto,
  InvitationRequestDto,
} from 'src/domain/room/dto/server';
import {
  ROOM_SNAPSHOT_STORE,
  type RoomSnapshotStore,
} from '../persistence/room-snapshot.store';
import {
  deserializeRoom,
  serializeRoom,
} from '../persistence/room-snapshot.codec';
@Injectable()
export class RoomStoreService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly rooms: Map<Id, RoomStore> = new Map();
  private readonly eventEmitter: EventEmitter = new EventEmitter();
  /** 단계 전이(특히 Spring 저장 대기) 중인 방. 같은 완료가 겹쳐 와도 한 번만 처리 */
  private readonly transitioning = new Set<Id>();
  private readonly dirty = new Set<Id>();
  private flushScheduled = false;
  isInvitation: boolean;
  constructor(
    private readonly logger: WsLogger,
    private readonly serverService: ServerService,
    @Optional()
    @Inject(ROOM_SNAPSHOT_STORE)
    private readonly snapshots?: RoomSnapshotStore,
  ) {
    // 단계별 최종값은 bump 없이 final 에 기록되므로 응답 시점에도 저장한다
    this.eventEmitter.on('final-state-response', ({ roomId }: { roomId: Id }) =>
      this.markDirty(roomId),
    );
  }

  // ===== 스냅샷 영속화 =====
  private get namespacePrefix(): string | undefined {
    if (this.isInvitation === true) return 'invitation:';
    if (this.isInvitation === false) return 'announcement:';
    return undefined;
  }

  /** 앱이 연결을 받기 전에(listen 전) 저장된 방 상태를 되살린다 */
  async onApplicationBootstrap(): Promise<void> {
    const prefix = this.namespacePrefix;
    if (!this.snapshots?.enabled || !prefix) return;
    const saved = await this.snapshots.loadAll(prefix);
    let restored = 0;
    for (const [roomId, json] of saved) {
      if (this.rooms.has(roomId)) continue;
      const room = deserializeRoom(json);
      if (!room || room.roomId !== roomId) continue;
      // 준비 카운트다운 타이머는 프로세스와 함께 사라졌다.
      // 클라이언트도 재연결 시 stage-changed 를 받아 준비를 해제하므로 서버도 맞춘다.
      for (const p of room.participants.values()) p.ready = false;
      this.rooms.set(roomId, room);
      restored++;
    }
    if (restored > 0)
      this.logger.log(`Restored ${restored} room(s) from snapshot (${prefix})`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const room of this.rooms.values())
      if (room.timeout) clearTimeout(room.timeout);
    await this.flush();
  }

  private markDirty(roomId: Id): void {
    if (!this.snapshots?.enabled || !this.rooms.has(roomId)) return;
    this.dirty.add(roomId);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setImmediate(() => void this.flush());
  }

  private async flush(): Promise<void> {
    this.flushScheduled = false;
    if (!this.snapshots?.enabled) return;
    const ids = Array.from(this.dirty);
    this.dirty.clear();
    await Promise.all(
      ids.map((id) => {
        const room = this.rooms.get(id);
        return room ? this.snapshots!.save(id, serializeRoom(room)) : undefined;
      }),
    );
  }

  /** 단계 전이 시작. 이미 진행 중이면 false */
  beginTransition(roomId: Id): boolean {
    if (this.transitioning.has(roomId)) return false;
    this.transitioning.add(roomId);
    return true;
  }

  endTransition(roomId: Id): void {
    this.transitioning.delete(roomId);
  }

  /**
   * 방 생성 또는 기존 방 반환
   */
  ensureRoom(roomId: string): RoomStore {
    let room = this.rooms.get(roomId);
    if (room) return room;

    room = {
      roomId,
      version: 1,
      updatedAt: Date.now(),
      stage: 'waiting',
      participants: new Map<Id, ExtendedParticipant>(),
      recentMenu: new Map(),
      chat: [],
      final: {
        date: '',
        time: '',
        location: undefined,
        excludeMenu: undefined,
        menu: undefined,
        restaurant: undefined,
      },
      timeout: undefined,
    };

    this.rooms.set(roomId, room);
    this.logger.log(
      `Created new room: ${roomId}, stage: ${room.stage} ${JSON.stringify(
        Array.from(room.recentMenu.entries()),
      )}`,
    );

    return room;
  }

  /**
   * 방 상태 가져오기 (읽기 전용)
   */
  getRoom(roomId: string): RoomStore | undefined {
    return this.rooms.get(roomId);
  }
  /**
   * 방 삭제
   */
  deleteRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room?.timeout) clearTimeout(room.timeout);
    const deleted = this.rooms.delete(roomId);
    this.dirty.delete(roomId);
    this.transitioning.delete(roomId);
    if (this.snapshots?.enabled) void this.snapshots.remove(roomId);
    if (deleted) {
      this.logger.log(`Deleted room: ${roomId}`);
    }
    return deleted;
  }

  /**
   * 버전 증가 및 업데이트 시간 갱신
   */
  bump(room: RoomStore): void {
    room.version += 1;
    room.updatedAt = Date.now();
    this.markDirty(room.roomId);
  }

  /**
   * 참여자 검증
   */
  canJoin(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.participants.has(userId);
  }

  /**
   * 참여자 추가
   */
  addParticipant(roomId: string, userId: string, username?: string): void {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = this.ensureRoom(roomId);
      this.rooms.set(roomId, room);
    }

    const participant: ExtendedParticipant = {
      userId,
      username: username ?? '',
      userProfileImageURL: '',
      ready: false,
    };
    const existingParticipant = room.participants.get(userId);
    if (existingParticipant) {
      return;
    } else {
      room.participants.set(userId, participant);
    }
    this.bump(room);
    this.logger.log(`User ${username || userId} added to room ${roomId}`);
  }

  /**
   * 참여자 제거
   */
  removeParticipant(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const deleted = room.participants.delete(userId);
    if (deleted) {
      this.bump(room);
      this.logger.log(`User ${userId} removed from room ${roomId}`);
    }
    return deleted;
  }

  /**
   * 참여자 목록 가져오기
   */
  getParticipants(roomId: string): Map<Id, ExtendedParticipant> {
    const room = this.rooms.get(roomId);
    return room?.participants ?? new Map<Id, ExtendedParticipant>();
  }

  /**
   * 방의 참여자 수 반환
   */
  getParticipantCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room?.participants.size || 0;
  }
  getFinalState(roomId: string): FinalState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return room?.final;
  }
  /**
   * 방 단계 변경
   */
  setStage(
    roomId: string,
    stage: AnnouncementStage | InvitationStage,
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.stage = stage;
    this.bump(room);
    this.logger.log(`Room ${roomId} stage changed to ${stage}`);
    return true;
  }

  /**
   * 방 단계 가져오기
   */
  getStage(roomId: string): AnnouncementStage | InvitationStage {
    const room = this.rooms.get(roomId);
    if (!room) return 'waiting';
    return room.stage;
  }

  getStageState(roomId: string): any {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.eventEmitter.emit('request-initial-state', {
      roomId,
      stage: room.stage,
    });
  }
  /**
   * 채팅 메시지 추가
   */
  addChatMessage(roomId: string, message: ChatMessage): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.chat.push(message);
    // 최근 100개만 유지
    if (room.chat.length > 100) {
      room.chat = room.chat.slice(-100);
    }
    this.bump(room);
  }

  /**
   * 채팅 메시지 가져오기
   */
  getChatMessages(roomId: string): ChatMessage[] {
    const room = this.rooms.get(roomId);
    return room?.chat || [];
  }

  /**
   * 참여자 준비 상태 업데이트
   */
  updateParticipantReadyState(
    roomId: string,
    userId: string,
    isReady: boolean,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.timeout) {
      clearTimeout(room.timeout);
    }
    const participant = room.participants.get(userId);
    if (!participant) return;
    participant.ready = isReady;
    this.bump(room);
    const readyCount = this.getParticipantReadyCount(roomId);
    if (readyCount === room.participants.size) {
      this.logger.log(`All participants are ready in room ${roomId}`);
      this.eventEmitter.emit('request-final-state', {
        roomId,
        stage: room.stage,
      });
      room.timeout = setTimeout(() => {
        const afterReadyCount = this.getParticipantReadyCount(roomId);
        if (afterReadyCount === room.participants.size) {
          this.eventEmitter.emit('ready-state-completed', {
            roomId,
            stage: room.stage,
          });
        }
      }, 3000);
    }
  }

  /**
   * 참여자 전체 준비 상태 가져오기
   */
  getParticipantReadyCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    return Array.from(room.participants.values()).filter(
      (participant) => participant.ready === true,
    ).length;
  }

  /**
   * 모든 참여자의 준비 상태 초기화
   */
  resetParticipantsReadyState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const participant of room.participants.values()) {
      participant.ready = false;
    }
    this.bump(room);
    this.logger.log(`Reset all participants' ready state in room ${roomId}`);
  }

  /**
   * 다음 단계로 넘어가기 전에 동점 여부 확인
   * TODO: 도메인별 tie-break 규칙을 구현하여 실제 동점 여부를 판별
   */
  hasPendingTie(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const stage = room.stage;
    // TODO: stage별 도메인 상태를 확인하여 동점 상황을 판별
    // 예: stage 2 (장소 투표)에서 최다 득표가 복수인 경우 등
    void stage; // placeholder to avoid unused var lint
    return false;
  }

  /**
   * 모든 방 목록 반환
   */
  getAllRooms(): Map<Id, RoomStore> {
    return this.rooms;
  }

  /**
   * 비활성 방 정리 (메모리 관리용)
   */
  cleanupInactiveRooms(maxInactiveMinutes: number = 60): number {
    const now = Date.now();
    const cutoffTime = now - maxInactiveMinutes * 60 * 1000;
    let cleanedCount = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.updatedAt < cutoffTime && room.participants.size === 0) {
        this.deleteRoom(roomId);
        cleanedCount++;
        this.logger.log(`Cleaned up inactive room: ${roomId}`);
      }
    }

    return cleanedCount;
  }

  /**
   * 방 초기화 (리셋)
   */
  resetRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.stage = 'waiting';
    room.version = 1;
    room.updatedAt = Date.now();
    room.participants.clear();
    room.chat = [];
    this.markDirty(roomId);

    this.logger.log(`Room ${roomId} reset`);
  }

  /**
   * 이벤트 에미터 가져오기
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  /**
   * 외부 API로부터 전달받은 Announcement 초기 데이터로 룸 시드
   */
  seedFromAnnouncement(roomId: string, dto: AnnouncementRequestDto): void {
    if (this.rooms.has(roomId)) return;
    const room = this.ensureRoom(roomId);
    room.locationInitial = dto.location;
    room.meetingAt = dto.meetingAt;
    // 참가자 세팅 (announcement: userName)
    room.participants = new Map(
      dto.participants.map((p) => [
        p.userId,
        {
          userId: p.userId,
          username: p.userName,
          userProfileImageURL: p.userProfileImageURL ?? '',
          ready: false,
        },
      ]),
    );
    // 최근 메뉴 세팅
    room.recentMenu = new Map(dto.recentMenu.map((r) => [r.userId, r.menu]));
    this.bump(room);
  }

  /**
   * 외부 API로부터 전달받은 Invitation 초기 데이터로 룸 시드
   */
  seedFromInvitation(roomId: string, dto: InvitationRequestDto): void {
    if (this.rooms.has(roomId)) return;
    const room = this.ensureRoom(roomId);
    // 참가자 세팅 (invitation: username)
    room.participants = new Map(
      dto.participants.map((p) => [
        p.userId,
        {
          userId: p.userId,
          username: p.username,
          userProfileImageURL: p.userProfileImageURL ?? '',
          ready: false,
        },
      ]),
    );
    // 최근 메뉴 세팅
    room.recentMenu = new Map(dto.recentMenu.map((r) => [r.userId, r.menu]));
    this.bump(room);
  }
}
