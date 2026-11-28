// s3.service.ts
import {
  S3Client,
  PutObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * 액세스 키 두 값이 모두 있을 때만 명시 자격증명을 넘긴다.
 * 없으면 credentials 를 생략해 SDK 기본 체인(환경·EC2 인스턴스 역할/IMDS 등)을 쓴다.
 */
export function s3ClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3ClientConfig {
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  return {
    region: env.AWS_REGION!,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  };
}

export class S3Service {
  private articleS3 = new S3Client(s3ClientConfig());
  private profileS3 = new S3Client(s3ClientConfig());
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
