import { IsArray, IsNotEmpty, IsString, Matches } from 'class-validator';

export class TimePickDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  // Array of ranges 'HH:mm–HH:mm'
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\d{2}:\d{2}–\d{2}:\d{2}$/, { each: true })
  times: string[];
}
