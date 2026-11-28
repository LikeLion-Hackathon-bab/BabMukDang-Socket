import { Module } from '@nestjs/common';
import { UploadsController } from './controllers/uploads.controller';
import { UploadsService } from './service/uploads.service';
import { S3Service } from './service/s3.service';
import { CdnService } from './service/cdn.service';
import { JwtService } from '@nestjs/jwt';
import { HttpJwtGuard } from './http-jwt.guard';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, S3Service, CdnService, JwtService, HttpJwtGuard],
})
export class ImageUploadModule {}
