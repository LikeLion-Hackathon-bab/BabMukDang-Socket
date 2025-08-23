// s3.service.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Service {
  private articleS3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  private profileS3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  private articleBucket = process.env.S3_ARTICLE_BUCKET!;
  private profileBucket = process.env.S3_PROFILE_BUCKET!;

  async createArticlePresignedPutUrl(
    key: string,
    contentType: string,
    expires = 300,
  ) {
    const cmd = new PutObjectCommand({
      Bucket: this.articleBucket,
      Key: key,
      ContentType: contentType,
      // 버킷은 private 가정 (CloudFront OAC/OAI로 서빙)
    });
    const url = await getSignedUrl(this.articleS3, cmd, { expiresIn: expires });
    return url;
  }

  async createProfilePresignedPutUrl(
    key: string,
    contentType: string,
    expires = 300,
  ) {
    const cmd = new PutObjectCommand({
      Bucket: this.profileBucket,
      Key: key,
      ContentType: contentType,
      // 버킷은 private 가정 (CloudFront OAC/OAI로 서빙)
    });
    const url = await getSignedUrl(this.profileS3, cmd, { expiresIn: expires });
    return url;
  }
}
