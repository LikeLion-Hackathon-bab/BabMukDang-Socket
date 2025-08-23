// uploads.service.ts
import { v4 as uuid } from 'uuid';
import { S3Service } from './s3.service';
import { CdnService } from './cdn.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadsService {
  constructor(
    private s3: S3Service,
    private cdn: CdnService,
  ) {}

  private keyForArticle(userId: string, ext: string) {
    return `articles/${userId}/${new Date().toISOString().slice(0, 10)}/${uuid()}.${ext}`;
  }

  private keyForProfile(userId: string, ext: string) {
    return `profiles/${userId}/${new Date().toISOString().slice(0, 10)}/${uuid()}.${ext}`;
  }

  async presignForArticle(opts: { userId: string; contentType: string }) {
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(opts.contentType)) {
      throw new Error('unsupported image type');
    }
    const ext = mimeToExt(opts.contentType);
    const key = this.keyForArticle(opts.userId, ext);
    const putUrl = await this.s3.createArticlePresignedPutUrl(
      key,
      opts.contentType,
      300,
    );
    const cdnUrl = this.cdn.publicUrl(key);
    return { key, putUrl, cdnUrl };
  }

  async presignForProfile(opts: { userId: string; contentType: string }) {
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(opts.contentType)) {
      throw new Error('unsupported image type');
    }
    const ext = mimeToExt(opts.contentType);
    const key = this.keyForProfile(opts.userId, ext);
    const putUrl = await this.s3.createProfilePresignedPutUrl(
      key,
      opts.contentType,
      300,
    );
    const cdnUrl = this.cdn.publicUrl(key);
    return { key, putUrl, cdnUrl };
  }
}

function mimeToExt(ct: string) {
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('avif')) return 'avif';
  return 'bin';
}
