import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './domain/common/http-error.filter';
import { clientOrigins } from './cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalFilters(new AllExceptionsFilter());
  // SIGTERM(배포·재시작) 시 대기 중인 방 상태 스냅샷을 쓰고 Redis 연결을 닫는다
  app.enableShutdownHooks();

  // 전역 ValidationPipe 설정
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS 설정
  app.enableCors({
    origin: clientOrigins(),
    credentials: true,
    exposedHeaders: ['Authorization'],
  });

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(
    port,
    configService.get<string>('BIND_ADDRESS') ?? '0.0.0.0',
  );
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🔌 Socket.IO server is ready for connections`);
}
void bootstrap();
