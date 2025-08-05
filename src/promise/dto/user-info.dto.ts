import { IsString, IsNotEmpty, Length } from 'class-validator';

export class UserInfoDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  nickname: string;
}
