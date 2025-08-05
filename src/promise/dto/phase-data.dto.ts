import {
  IsOptional,
  ValidateNested,
  IsArray,
  IsString,
  IsNotEmpty,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class LocationSelectionItemDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

class RecentMenusItemDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsArray()
  @IsString({ each: true })
  menus: string[];
}

class WantedMenusItemDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsString()
  @IsNotEmpty()
  selectMenu: string;
}

class FinalPlaceItemDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  nickname: string;

  @IsString()
  @IsNotEmpty()
  selectPlace: string;
}

export class PhaseDataContentDto {
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LocationSelectionItemDto)
  locationSelection?: LocationSelectionItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecentMenusItemDto)
  recentMenus?: RecentMenusItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => WantedMenusItemDto)
  wantedMenus?: WantedMenusItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FinalPlaceItemDto)
  finalPlace?: FinalPlaceItemDto[];
}

export class PhaseDataDto {
  @IsNumber()
  phase: number;

  @ValidateNested()
  @Type(() => PhaseDataContentDto)
  data: PhaseDataContentDto;
}
