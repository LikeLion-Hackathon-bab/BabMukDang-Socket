import { S3Client } from '@aws-sdk/client-s3';
import { S3Service, s3ClientConfig } from './s3.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual =
    jest.requireActual<typeof import('@aws-sdk/client-s3')>(
      '@aws-sdk/client-s3',
    );
  return { ...actual, S3Client: jest.fn() };
});

describe('S3Client 생성 옵션', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    (S3Client as unknown as jest.Mock).mockClear();
  });

  it('키 두 값이 모두 있으면 명시 자격증명을 넘긴다', () => {
    process.env.AWS_REGION = 'ap-northeast-2';
    process.env.AWS_ACCESS_KEY_ID = 'AKIATEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    new S3Service();
    const calls = (S3Client as unknown as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [opts] of calls)
      expect(opts).toEqual({
        region: 'ap-northeast-2',
        credentials: { accessKeyId: 'AKIATEST', secretAccessKey: 'secret' },
      });
  });

  it('키가 없거나 하나만 있으면 credentials 를 생략한다(기본 체인·인스턴스 역할)', () => {
    process.env.AWS_REGION = 'ap-northeast-2';
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    new S3Service();
    for (const [opts] of (S3Client as unknown as jest.Mock).mock.calls) {
      expect(opts).toEqual({ region: 'ap-northeast-2' });
      expect(opts).not.toHaveProperty('credentials');
    }
    expect(
      s3ClientConfig({ AWS_REGION: 'r', AWS_ACCESS_KEY_ID: 'only-id' }),
    ).toEqual({ region: 'r' });
    expect(
      s3ClientConfig({ AWS_REGION: 'r', AWS_SECRET_ACCESS_KEY: 'only-secret' }),
    ).toEqual({ region: 'r' });
  });
});
