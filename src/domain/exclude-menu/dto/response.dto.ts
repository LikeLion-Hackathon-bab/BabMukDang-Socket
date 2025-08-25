import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { MenuRecommendation } from 'src/domain/menu/types/menu.type';

export class ExclusionMenuResponseDto {
  @IsArray()
  // @ValidateNested({ each: true })
  // @Type(() =>  {}MenuRecommendation)
  availableMenus: MenuRecommendation[];
}
