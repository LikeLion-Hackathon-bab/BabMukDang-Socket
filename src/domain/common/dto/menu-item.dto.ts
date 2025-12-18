import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 메뉴 아이템 DTO
 * Spring 서버의 MenuItemDto와 매핑됨
 */
export class MenuItemDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  label: string;
}

/**
 * 기존 MenuRecommendation 타입 호환용 alias
 */
export type MenuRecommendation = MenuItemDto;
