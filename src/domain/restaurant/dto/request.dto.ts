import { IsNotEmpty, IsString } from 'class-validator';

export class RestaurantActionDto {
  @IsString()
  @IsNotEmpty()
  restaurantId: string;
}

export class RestaurantPickDto extends RestaurantActionDto {}
export class RestaurantUnpickDto extends RestaurantActionDto {}
