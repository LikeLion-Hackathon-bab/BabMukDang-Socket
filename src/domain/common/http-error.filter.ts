import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : ((response as any).message ?? message);
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    this.logger.error(exception);

    res.status(status).json({
      success: false,
      path: req.originalUrl,
      method: req.method,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
