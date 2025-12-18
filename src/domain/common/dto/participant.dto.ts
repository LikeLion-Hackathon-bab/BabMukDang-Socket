import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 공통 참여자 DTO
 * Spring 서버의 ParticipationSocketDto와 매핑됨
 * - Spring: userId, userName, userProfileImageURL
 */
export class ParticipantDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsString()
  @IsOptional()
  userProfileImageURL?: string;
}
