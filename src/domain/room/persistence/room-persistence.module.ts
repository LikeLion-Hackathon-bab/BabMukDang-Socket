import { Global, Module } from '@nestjs/common';
import {
  createRoomSnapshotStore,
  ROOM_SNAPSHOT_STORE,
} from './room-snapshot.store';

/** 방 상태 스냅샷 저장소(REDIS_URL 이 있으면 Redis, 없으면 저장 안 함) */
@Global()
@Module({
  providers: [
    {
      provide: ROOM_SNAPSHOT_STORE,
      useFactory: () => createRoomSnapshotStore(),
    },
  ],
  exports: [ROOM_SNAPSHOT_STORE],
})
export class RoomPersistenceModule {}
