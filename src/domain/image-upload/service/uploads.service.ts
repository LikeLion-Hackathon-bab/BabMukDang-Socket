// uploads.service.ts
import { v4 as uuid } from 'uuid';
import { S3Service } from './s3.service';
import { CdnService } from './cdn.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { MAX_UPLOAD_BYTES } from '../dto/presign.dto';

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|avif)$/;

type PresignInput = { userId: string; contentType: string; size: number };

/** 형식·크기·사용자 id 를 확인한다. 실패하면 400 */
function check(opts: PresignInput) {
  if (!IMAGE_TYPES.test(opts.contentType))
    throw new BadRequestException('unsupported image type');
  if (
    !Number.isInteger(opts.size) ||
    opts.size < 1 ||
    opts.size > MAX_UPLOAD_BYTES
  )
    throw new BadRequestException('file too large');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(opts.userId))
    throw new BadRequestException('invalid user');
}

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

  async presignForArticle(opts: PresignInput) {
    check(opts);
    const ext = mimeToExt(opts.contentType);
    const key = this.keyForArticle(opts.userId, ext);
    const putUrl = await this.s3.createArticlePresignedPutUrl(
      key,
      opts.contentType,
      opts.size,
      300,
    );
    const cdnUrl = this.cdn.publicUrl(key);
    return { key, putUrl, cdnUrl };
  }

  async presignForProfile(opts: PresignInput) {
    check(opts);
    const ext = mimeToExt(opts.contentType);
    const key = this.keyForProfile(opts.userId, ext);
    const putUrl = await this.s3.createProfilePresignedPutUrl(
      key,
      opts.contentType,
      opts.size,
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
