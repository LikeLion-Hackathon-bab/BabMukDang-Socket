// npm i class-validator class-transformer
import { IsString } from 'class-validator';

export class PresignArticleDto {
  @IsString()
  userId: string;

  @IsString()
  contentType: string; // 실제 체크는 서비스에서 정규화 후 실행
}

export class PresignProfileDto {
  @IsString()
  userId: string;

  @IsString()
  contentType: string; // 실제 체크는 서비스에서 정규화 후 실행
}
