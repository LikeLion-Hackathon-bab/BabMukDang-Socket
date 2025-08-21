import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

export class MenuRecommendationDto {
  @IsString()
  code: string;

  @IsString()
  label: string;

  @IsNumber()
  score: number;

  @IsArray()
  @IsString({ each: true })
  reason: string[];
}

export class MenuRecommendationResponseDto {
  @IsArray()
  @IsString({ each: true })
  usersId: string[];

  @IsString()
  roomId: string;

  @IsNumber()
  exclude_days: number;

  @IsArray()
  @IsString({ each: true })
  excluded_codes: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuRecommendationDto)
  recommendations: MenuRecommendationDto[];
}
