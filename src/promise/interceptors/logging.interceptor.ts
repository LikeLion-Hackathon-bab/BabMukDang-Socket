import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const event = context.switchToWs().getPattern();

    const startTime = Date.now();
    const socketId = client.id;
    const roomId = data?.roomId;
    const userId = data?.userId;

    this.logger.log(
      `WebSocket Event: ${event} | Socket: ${socketId} | Room: ${roomId} | User: ${userId}`,
    );

    return next.handle().pipe(
      tap({
        next: (result) => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `WebSocket Event Completed: ${event} | Duration: ${duration}ms | Socket: ${socketId}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `WebSocket Event Failed: ${event} | Duration: ${duration}ms | Socket: ${socketId} | Error: ${error.message}`,
          );
        },
      }),
    );
  }
}
