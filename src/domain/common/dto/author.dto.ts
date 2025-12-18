import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 작성자 DTO
 * Spring 서버의 PlanDtos.Author와 매핑됨
 */
export class AuthorDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
