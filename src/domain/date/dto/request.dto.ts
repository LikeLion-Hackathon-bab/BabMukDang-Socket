import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class DatePickDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  // Array of strings like '25. 08. 02'
  @IsArray()
  @IsString({ each: true })
  dates: string[];
}
