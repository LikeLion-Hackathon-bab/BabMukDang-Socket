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
import type { MenuRecommendation } from 'src/domain/menu/types/menu.type';
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
  /** 지워야 하는데 Redis 삭제가 실패한 방. 다시 시도한다(리뷰 S3) */
  private readonly pendingRemovals = new Set<Id>();
  private retryTimer?: NodeJS.Timeout;
  private flushScheduled = false;
  /** 저장·삭제 실패 뒤 다시 시도하는 간격 */
  snapshotRetryMs = 2000;
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
      // finish 는 Spring 저장이 끝난 방이다. 지우다 실패해 남은 것이므로 되살리지 않는다(리뷰 S3)
      if (room.stage === 'finish') {
        void this.removeSnapshot(roomId);
        continue;
      }
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    await this.flush();
    await Promise.all(
      Array.from(this.pendingRemovals).map((id) =>
        this.removeSnapshot(id, false),
      ),
    );
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      for (const id of Array.from(this.pendingRemovals))
        if (!this.rooms.has(id)) void this.removeSnapshot(id);
        else this.pendingRemovals.delete(id);
      void this.flush();
    }, this.snapshotRetryMs);
    this.retryTimer.unref?.();
  }

  /** 스냅샷을 지운다. 실패하면 다시 시도 목록에 넣는다 */
  private async removeSnapshot(roomId: Id, retry = true): Promise<void> {
    if (!this.snapshots?.enabled) return;
    const ok = await this.snapshots.remove(roomId);
    if (ok || this.rooms.has(roomId)) {
      this.pendingRemovals.delete(roomId);
      return;
    }
    this.pendingRemovals.add(roomId);
    if (retry) this.scheduleRetry();
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
      ids.map(async (id) => {
        const room = this.rooms.get(id);
        if (!room) return;
        const ok = await this.snapshots!.save(id, serializeRoom(room));
        if (!ok) {
          // 저장 실패: 다음 변경이 없어도 다시 쓴다(리뷰 S8)
          if (this.rooms.has(id)) this.dirty.add(id);
          this.scheduleRetry();
        } else if (!this.rooms.has(id)) {
          // 저장하는 동안 방이 지워졌다: 방금 쓴 키를 다시 지운다
          await this.removeSnapshot(id);
        }
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

  isTransitioning(roomId: Id): boolean {
    return this.transitioning.has(roomId);
  }

  /** 전원 준비 뒤 3초 카운트다운 중 */
  isCountingDown(roomId: Id): boolean {
    return this.rooms.get(roomId)?.timeout !== undefined;
  }

  /**
   * 확정값을 계산한 뒤(카운트다운)부터 다음 단계로 넘어갈 때까지(Spring 저장 대기 포함)는
   * 표·선택을 바꾸지 못하게 한다. 판정·확정·저장이 같은 표를 보게 하기 위해서다.
   */
  isLocked(roomId: Id): boolean {
    return this.isTransitioning(roomId) || this.isCountingDown(roomId);
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
    // 같은 id 의 옛 방 삭제가 밀려 있으면 취소한다(새 방 저장이 키를 덮는다)
    this.pendingRemovals.delete(roomId);
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
    void this.removeSnapshot(roomId);
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
  ): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    // 단계 전이(Spring 저장 대기) 중에는 준비를 바꿀 수 없다. 카운트다운 중 준비 해제는 허용한다(취소).
    if (this.transitioning.has(roomId)) return false;
    const participant = room.participants.get(userId);
    if (!participant) return false;
    if (room.timeout) {
      clearTimeout(room.timeout);
      room.timeout = undefined;
    }
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
        room.timeout = undefined;
        const afterReadyCount = this.getParticipantReadyCount(roomId);
        if (afterReadyCount === room.participants.size) {
          this.eventEmitter.emit('ready-state-completed', {
            roomId,
            stage: room.stage,
          });
        }
      }, 3000);
    }
    return true;
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

  /** 서버 쪽 사정으로 방을 닫는다(결과 저장 409 data 없음 등). 해산 이벤트 후 삭제 */
  closeRoom(roomId: string, reason: string): void {
    if (!this.rooms.has(roomId)) return;
    this.eventEmitter.emit('room-dissolved', { roomId, reason });
    this.deleteRoom(roomId);
  }

  /**
   * Spring 의 참여 취소 알림(contracts/participation-cancel.md §3).
   * dissolve=false: 그 사용자를 명단·투표·선택에서 빼고 모두의 준비를 푼다.
   * dissolve=true: 방을 지운다(스냅샷 포함). 같은 id 로 다시 시드가 오면 새 방이 된다.
   * 방이 없으면 아무것도 하지 않는다(멱등). 알림은 이벤트로 내보내 게이트웨이가 방송한다.
   */
  leaveRoom(
    roomId: string,
    userId: string,
    dissolve: boolean,
  ): 'left' | 'dissolved' | 'noop' {
    const room = this.rooms.get(roomId);
    if (!room) {
      // 메모리에 없어도(복원 실패 등) 스냅샷이 남아 있을 수 있다. 다음 재시작에 되살아나지 않게 지운다(리뷰 S3)
      if (dissolve) void this.removeSnapshot(roomId);
      return 'noop';
    }
    if (dissolve) {
      this.eventEmitter.emit('room-dissolved', {
        roomId,
        reason: 'participant-left',
        userId,
      });
      this.deleteRoom(roomId);
      return 'dissolved';
    }
    if (!room.participants.has(userId)) return 'noop';
    room.participants.delete(userId);
    if (room.timeout) clearTimeout(room.timeout);
    room.timeout = undefined;
    room.location?.votes.forEach((set) => set.delete(userId));
    room.menu?.menuPerUserSelections.forEach((set) => set.delete(userId));
    room.restaurant?.restaurantUserList.delete(userId);
    room.excludeMenu?.userExclusions.delete(userId);
    room.date?.pickedByUser.delete(userId);
    room.time?.pickedByUser.delete(userId);
    room.recentMenu.delete(userId);
    for (const p of room.participants.values()) p.ready = false;
    this.bump(room);
    this.logger.log(`User ${userId} left room ${roomId} (by Spring)`);
    this.eventEmitter.emit('room-participant-left', { roomId, userId });
    return 'left';
  }

  /**
   * 권위 시드(Spring 입장 API 가 DB 참여자 목록으로 보낸 시드)에 없는 참가자를 뺀다(리뷰 S2).
   * 나가기 알림이 유실됐거나 재시작 복원으로 나간 사람이 돌아온 경우를 바로잡는다.
   * 정리 방식은 나가기 알림(dissolve:false)과 같다. 이벤트 경로의 시드는 커밋 전 발행일 수 있어 권위가 없다.
   */
  private dropMissingParticipants(
    roomId: string,
    participants: Array<{ userId: string }>,
  ): void {
    const keep = new Set((participants ?? []).map((p) => p?.userId));
    if (keep.size === 0) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const uid of Array.from(room.participants.keys()))
      if (!keep.has(uid)) {
        this.logger.log(
          `Room ${roomId} authoritative seed dropped participant ${uid}`,
        );
        this.leaveRoom(roomId, uid, false);
      }
  }

  /**
   * 이미 있는 방에 다시 시드가 오면(완료 이벤트 재전달, 입장 API) 진행 상태는 그대로 두고
   * 빠진 참가자만 더한다. Spring 이 커밋 전에 완료 이벤트를 발행해 마지막 참가자가
   * 빠진 명단으로 방이 먼저 만들어지는 경우를 입장 API 가 바로잡는다.
   */
  private mergeParticipants(
    roomId: string,
    participants: Array<{
      userId: string;
      username: string;
      userProfileImageURL?: string;
    }>,
    recentMenu: Array<{ userId: string; menu: MenuRecommendation[] }>,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const added: string[] = [];
    for (const p of participants ?? []) {
      if (!p?.userId || room.participants.has(p.userId)) continue;
      room.participants.set(p.userId, {
        userId: p.userId,
        username: p.username,
        userProfileImageURL: p.userProfileImageURL ?? '',
        ready: false,
      });
      added.push(p.userId);
    }
    for (const r of recentMenu ?? [])
      if (r?.userId && !room.recentMenu.has(r.userId))
        room.recentMenu.set(r.userId, r.menu);
    if (added.length === 0) return;
    this.bump(room);
    this.logger.log(
      `Room ${roomId} re-seeded: added participant(s) ${added.join(',')}`,
    );
  }

  /**
   * 외부 API로부터 전달받은 Announcement 초기 데이터로 룸 시드
   */
  seedFromAnnouncement(
    roomId: string,
    dto: AnnouncementRequestDto,
    authoritative = false,
  ): void {
    if (this.rooms.has(roomId)) {
      if (authoritative || dto.authoritative === true)
        this.dropMissingParticipants(roomId, dto.participants);
      return this.mergeParticipants(
        roomId,
        dto.participants.map((p) => ({ ...p, username: p.userName })),
        dto.recentMenu,
      );
    }
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
  seedFromInvitation(
    roomId: string,
    dto: InvitationRequestDto,
    authoritative = false,
  ): void {
    if (this.rooms.has(roomId)) {
      if (authoritative || dto.authoritative === true)
        this.dropMissingParticipants(roomId, dto.participants);
      return this.mergeParticipants(roomId, dto.participants, dto.recentMenu);
    }
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
