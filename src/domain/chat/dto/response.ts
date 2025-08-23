import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { UserDto } from 'src/domain/common/types';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  roomId: string;

  @ValidateNested()
  @Type(() => UserDto)
  user: UserDto;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsString()
  @IsNotEmpty()
  createdAt: string;

  @IsOptional()
  @IsString()
  updatedAt?: string;

  @IsOptional()
  @IsBoolean()
  isEdited?: boolean;

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
