import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PromiseModule } from './promise/promise.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    PromiseModule,
    ConfigModule.forRoot({ cache: true, isGlobal: true }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
