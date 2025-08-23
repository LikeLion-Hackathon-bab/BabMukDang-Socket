import { IsOptional, IsString } from 'class-validator';

export class ChatSendRequestDto {
  @IsOptional()
  @IsString()
  text?: string;
}
