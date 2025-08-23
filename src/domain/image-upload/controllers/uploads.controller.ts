// uploads.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { UploadsService } from '../service/uploads.service';
import { PresignArticleDto, PresignProfileDto } from '../dto/presign.dto';

@Controller('uploads')
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  @Post('presign-article')
  async presignArticle(@Body() dto: PresignArticleDto) {
    const { key, putUrl, cdnUrl } = await this.uploads.presignForArticle(dto);
    return { key, putUrl, cdnUrl }; // 프론트가 이 cdnUrl을 그대로 ArticlePostRequest.imageUrl에 사용
  }

  @Post('presign-profile')
  async presignProfile(@Body() dto: PresignProfileDto) {
    const { key, putUrl, cdnUrl } = await this.uploads.presignForProfile(dto);
    return { key, putUrl, cdnUrl };
  }
}
