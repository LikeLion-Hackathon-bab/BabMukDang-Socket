import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PromiseModule } from './promise/promise.module';

@Module({
  imports: [PromiseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
