import { IsString, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MenuItemDto } from './menu-item.dto';

/**
 * 최근 메뉴 DTO
 * Spring 서버의 RecentMenuDto와 매핑됨
 */
export class RecentMenuDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menu: MenuItemDto[];
}
