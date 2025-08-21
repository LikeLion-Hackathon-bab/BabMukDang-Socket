import { Module } from '@nestjs/common';
import { LocationService } from './services/location.service';
import { LocationHandlers } from './gateway/location.gateway';
import { RoomModule } from '../room/room.module';

@Module({
  imports: [RoomModule],
  providers: [LocationService, LocationHandlers],
  exports: [LocationService, LocationHandlers],
})
export class LocationModule {}
