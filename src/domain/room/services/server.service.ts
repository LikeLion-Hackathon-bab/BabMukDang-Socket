import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { lastValueFrom, retry, timeout } from 'rxjs';
import {
  AnnouncementResultRequestDto,
  InvitationResultRequestDto,
} from '../dto/server';

/** 결과 저장 409 인데 data(저장값)가 없음: 확정이 아니라 방이 더 이상 유효하지 않음 */
export class RoomClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomClosedError';
  }
}

export interface InvitationMeetingResult {
  meetingAt: string; // 오프셋 포함 ISO 8601 (예: 2026-12-01T13:00:00+09:00)
  location: string;
  restaurant: string;
}

type HttpResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

@Injectable()
export class ServerService {
  private readonly logger = new Logger(ServerService.name);
  constructor(private readonly http: HttpService) {}

  private async safeGet<T>(url: string): Promise<HttpResult<T>> {
    try {
      const { data, status } = await lastValueFrom(
        this.http.get<T>(url).pipe(
          timeout(5000), // 5초 타임아웃
          retry(2), // 일시 오류 시 2회 재시도
        ),
      );
      return { ok: true, data, status };
    } catch (e) {
      const err = e as AxiosError;
      this.logger.error(`GET ${url} failed`, err.stack);
      return {
        ok: false,
        status: err.response?.status ?? 500,
        message: err.message,
      };
    }
  }

  private async safePost<T>(url: string, body: any): Promise<HttpResult<T>> {
    try {
      const { data, status } = await lastValueFrom(
        this.http.post<T>(url, body).pipe(timeout(5000), retry(1)),
      );
      return { ok: true, data, status };
    } catch (e) {
      const err = e as AxiosError;
      this.logger.error(`POST ${url} failed`, err.stack);
      return {
        ok: false,
        status: err.response?.status ?? 500,
        message: err.message,
      };
    }
  }

  /**
   * Spring 결과 저장 공통: 2xx → undefined(보낸 값 그대로 확정),
   * 409 + data → Spring 에 이미 저장된 값(앞 요청이 시간 초과였지만 늦게 커밋된 경우),
   * 그 밖의 실패는 throw (단계를 넘기지 않는다).
   */
  private async postRoomResult<T>(
    path: string,
    body: unknown,
  ): Promise<T | undefined> {
    const key = process.env.ROOM_RESULT_KEY;
    const origin = process.env.SPRING_API_SERVER;
    if (!key || !origin)
      throw new Error('Room result destination is not configured');
    const base = origin.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
    try {
      await lastValueFrom(
        this.http.post(base + path, body, {
          headers: { 'X-Room-Key': key },
          timeout: 5000,
        }),
      );
      return undefined;
    } catch (e) {
      const err = e as AxiosError<{ data?: T; message?: string }>;
      if (err.response?.status === 409) {
        const stored = err.response.data?.data;
        if (stored) return stored;
        throw new RoomClosedError(
          err.response.data?.message ?? 'Room result rejected (409)',
        );
      }
      throw e;
    }
  }

  /** contracts/meeting-result.md */
  async saveConfirmedRestaurant(
    postId: string,
    restaurant: string,
  ): Promise<{ restaurant: string } | undefined> {
    return this.postRoomResult<{ restaurant: string }>(
      '/api/v1/meetings/' + encodeURIComponent(postId) + '/result',
      { restaurant },
    );
  }

  /** contracts/invitation-result.md */
  async saveInvitationResult(
    invitationId: string,
    result: InvitationMeetingResult,
  ): Promise<InvitationMeetingResult | undefined> {
    return this.postRoomResult<InvitationMeetingResult>(
      '/api/v1/meetings/invitations/' +
        encodeURIComponent(invitationId) +
        '/result',
      { invitationId: Number(invitationId), ...result },
    );
  }

  async postAnnouncementResult(
    roomId: string,
    dto: AnnouncementResultRequestDto,
  ) {
    return this.safePost<AnnouncementResultRequestDto>(
      `${process.env.SPRING_API_SERVER}/announcement/${roomId}`,
      dto,
    );
  }

  async postInvitationResult(roomId: string, dto: InvitationResultRequestDto) {
    return this.safePost<InvitationResultRequestDto>(
      `${process.env.SPRING_API_SERVER}/invitation/${roomId}`,
      dto,
    );
  }
}
