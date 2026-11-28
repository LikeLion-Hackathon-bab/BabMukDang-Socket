import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 서명 URL 로 올릴 수 있는 최대 크기(바이트) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class PresignDto {
  /** 무시한다. 사용자 id 는 토큰 sub 에서 꺼낸다(옛 Client 가 보내므로 받아만 둔다) */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  contentType: string;

  /** 올릴 파일 크기. 서명에 Content-Length 로 들어가 다른 크기로는 올릴 수 없다 */
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size: number;
}

export class PresignArticleDto extends PresignDto {}
export class PresignProfileDto extends PresignDto {}
