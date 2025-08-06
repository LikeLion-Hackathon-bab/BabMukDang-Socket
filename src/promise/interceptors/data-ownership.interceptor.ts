import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class DataOwnershipInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const data = context.switchToWs().getData();
    const userId = data?.userId;

    if (!userId) {
      throw new WsException('User ID is required for data ownership check');
    }

    return next.handle().pipe(
      map((result) => {
        // 응답 데이터에서 사용자 소유권 검사
        if (result && typeof result === 'object') {
          this.validateDataOwnership(result, userId);
        }
        return result;
      }),
    );
  }

  private validateDataOwnership(data: any, userId: string): void {
    if (!data || typeof data !== 'object') {
      return;
    }

    // 단계 데이터 소유권 검사
    if (data.phaseData) {
      this.validatePhaseDataOwnership(data.phaseData, userId);
    }

    // 일반 데이터 소유권 검사
    if (data.userId && data.userId !== userId) {
      throw new WsException('Data ownership validation failed');
    }
  }

  private validatePhaseDataOwnership(phaseData: any, userId: string): void {
    const fields = [
      'locationSelection',
      'recentMenus',
      'wantedMenus',
      'finalPlace',
    ];

    for (const field of fields) {
      if (phaseData[field] && Array.isArray(phaseData[field])) {
        for (const item of phaseData[field]) {
          if (
            item &&
            typeof item === 'object' &&
            item.userId &&
            item.userId !== userId
          ) {
            throw new WsException(
              `Data ownership validation failed for ${field}`,
            );
          }
        }
      }
    }
  }
}
