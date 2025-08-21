import { Global, Module } from '@nestjs/common';
import { WsContextStore } from './ws-context.store';
import { WsLogger } from './ws-logger.service';

@Global()
@Module({
  providers: [WsContextStore, WsLogger],
  exports: [WsContextStore, WsLogger],
})
export class LoggerModule {}
