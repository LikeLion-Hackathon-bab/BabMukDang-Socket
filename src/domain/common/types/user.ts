import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export type Id = string;
export interface UserInfo {
  userId: string;
  username: string;
  role: string;
}

export class UserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  role?: string;
}
