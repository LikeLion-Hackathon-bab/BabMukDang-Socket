import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { lastValueFrom, retry, timeout } from 'rxjs';
import {
  AnnouncementResultRequestDto,
  InvitationResultRequestDto,
} from '../dto/server';

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
