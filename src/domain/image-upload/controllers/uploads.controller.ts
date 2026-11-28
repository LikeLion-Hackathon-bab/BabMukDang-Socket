// uploads.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { UploadsService } from '../service/uploads.service';
import { PresignArticleDto, PresignProfileDto } from '../dto/presign.dto';
import { HttpJwtGuard, type AuthedRequest } from '../http-jwt.guard';

@Controller('uploads')
@UseGuards(HttpJwtGuard)
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  @Post('presign-article')
  async presignArticle(
    @Req() req: AuthedRequest,
    @Body() dto: PresignArticleDto,
  ) {
    const { key, putUrl, cdnUrl } = await this.uploads.presignForArticle({
      userId: req.authUserId!,
      contentType: dto.contentType,
      size: dto.size,
    });
    return { key, putUrl, cdnUrl }; // 프론트가 이 cdnUrl을 그대로 ArticlePostRequest.imageUrl에 사용
  }

  @Post('presign-profile')
  async presignProfile(
    @Req() req: AuthedRequest,
    @Body() dto: PresignProfileDto,
  ) {
    const { key, putUrl, cdnUrl } = await this.uploads.presignForProfile({
      userId: req.authUserId!,
      contentType: dto.contentType,
      size: dto.size,
    });
    return { key, putUrl, cdnUrl };
  }
}
