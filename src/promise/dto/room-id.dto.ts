import { IsString, IsNotEmpty } from 'class-validator';

export class RoomIdDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}
