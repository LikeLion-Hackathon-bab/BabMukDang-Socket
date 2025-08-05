import { Module } from '@nestjs/common';
import { PromiseGateway } from './promise.gateway';

@Module({
  providers: [PromiseGateway],
  exports: [PromiseGateway],
})
export class PromiseModule {}
