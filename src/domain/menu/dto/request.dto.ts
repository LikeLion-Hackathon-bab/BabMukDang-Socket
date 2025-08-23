import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class MenuActionDto {
  @IsString()
  @IsNotEmpty()
  menuId: string;
}

export class MenuPickDto extends MenuActionDto {}
export class MenuUnpickDto extends MenuActionDto {}

export class MenuRecommendationAIRequestDto {
  @IsString()
  @IsNotEmpty()
  group_id: string;

  @IsArray()
  @IsNotEmpty()
  user_ids: string[];

  @IsNumber()
  @IsNotEmpty()
  exclude_days: number;

  @IsNumber()
  @IsNotEmpty()
  top_k: number;
}
