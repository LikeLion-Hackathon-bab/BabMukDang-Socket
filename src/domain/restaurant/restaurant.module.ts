import { Module } from '@nestjs/common';
import { RoomModule } from '../room/room.module';
import { RestaurantHandlers } from './gateway/restaurant.gateway';
import { RestaurantService } from './services/restaurant.service';

@Module({
  imports: [RoomModule],
  providers: [RestaurantHandlers, RestaurantService],
  exports: [RestaurantHandlers, RestaurantService],
})
export class RestaurantModule {}
