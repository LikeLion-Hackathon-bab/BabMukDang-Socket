import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MenuRecommendationDto {
  @IsString()
  code: string;

  @IsString()
  label: string;

  @IsNumber()
  group_score: number;

  @IsObject()
  member_scores: Record<string, number>;

  @IsArray()
  @IsString({ each: true })
  reasons: string[];
}

class PerUserDto {
  @IsString()
  user_id: string;

  @IsArray()
  @IsString({ each: true })
  excluded_codes: string[];

  @IsArray()
  @IsString({ each: true })
  overrides_applied: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TasteTopDto)
  taste_top: TasteTopDto[];
}

class TasteTopDto {
  @IsString()
  code: string;

  @IsString()
  label: string;

  @IsNumber()
  score: number;
}

class GroupExcludedDto {
  @IsString()
  mode: string;

  @IsArray()
  @IsString({ each: true })
  codes: string[];
}

class ParamsDto {
  @IsString()
  taste_mode: string;

  @IsString()
  exclude_mode: string;

  @IsObject()
  weights: Record<string, number>;

  @IsNumber()
  top_k: number;
}

export class MenuRecommendationResponseDto {
  @IsString()
  group_id: string;

  @IsArray()
  @IsString({ each: true })
  user_ids: string[];

  @IsNumber()
  exclude_days: number;

  @IsArray()
  @IsString({ each: true })
  excluded_codes: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerUserDto)
  per_user: PerUserDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => GroupExcludedDto)
  group_excluded: GroupExcludedDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuRecommendationDto)
  recommendations: MenuRecommendationDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => ParamsDto)
  params: ParamsDto;
}
