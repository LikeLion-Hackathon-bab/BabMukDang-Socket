import { IsArray, ValidateNested } from 'class-validator';
import { ExclusionCategoryId } from '../types/exclude-menu.types';
import { Type } from 'class-transformer';

export class ExclusionCategoryResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => String)
  availableCategories: ExclusionCategoryId[];
}
