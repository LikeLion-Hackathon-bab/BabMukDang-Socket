import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorHandlingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorHandlingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        this.handleError(context, error);
        return throwError(() => error);
      }),
    );
  }

  private handleError(context: ExecutionContext, error: any): void {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const event = context.switchToWs().getPattern();

    // 에러 로깅
    this.logger.error(`WebSocket error in event '${event}': ${error.message}`, {
      clientId: client.id,
      event,
      data,
      error: error.stack,
      timestamp: new Date().toISOString(),
    });

    // 클라이언트에게 에러 전송
    try {
      if (client.connected) {
        client.emit('error', {
          message: this.getUserFriendlyMessage(error),
          code: this.getErrorCode(error),
          timestamp: Date.now(),
        });
      }
    } catch (emitError) {
      this.logger.error('Failed to emit error to client', emitError);
    }
  }

  private getUserFriendlyMessage(error: any): string {
    if (error instanceof WsException) {
      return error.message;
    }

    // 일반적인 에러 메시지 변환
    const errorMessages: Record<string, string> = {
      Unauthorized: '인증이 필요합니다.',
      Forbidden: '접근 권한이 없습니다.',
      'Not Found': '요청한 리소스를 찾을 수 없습니다.',
      'Bad Request': '잘못된 요청입니다.',
      'Internal Server Error': '서버 내부 오류가 발생했습니다.',
    };

    return errorMessages[error.message] || '알 수 없는 오류가 발생했습니다.';
  }

  private getErrorCode(error: any): string {
    if (error instanceof WsException) {
      return 'WS_ERROR';
    }

    // 에러 타입별 코드 반환
    const errorCodes: Record<string, string> = {
      Unauthorized: 'AUTH_REQUIRED',
      Forbidden: 'ACCESS_DENIED',
      'Not Found': 'RESOURCE_NOT_FOUND',
      'Bad Request': 'INVALID_REQUEST',
      'Internal Server Error': 'INTERNAL_ERROR',
    };

    return errorCodes[error.message] || 'UNKNOWN_ERROR';
  }
}
