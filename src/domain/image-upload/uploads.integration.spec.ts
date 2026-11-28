/** 보안 리뷰 S3: 업로드 서명 URL 은 로그인 사용자만, 자기 id 경로로, 이미지·크기 제한 안에서 */
import type { INestApplication } from '@nestjs/common';
import { bootApp, token } from 'src/domain/room/integration/harness';
import { MAX_UPLOAD_BYTES } from './dto/presign.dto';

jest.setTimeout(30_000);

describe('업로드 서명 발급', () => {
  let app: INestApplication;
  let port: number;
  beforeAll(async () => {
    Object.assign(process.env, {
      AWS_REGION: 'ap-northeast-2',
      AWS_ACCESS_KEY_ID: 'AKIAQAFIXTURE0000000',
      AWS_SECRET_ACCESS_KEY: 'qa-fixture-secret',
      S3_ARTICLE_BUCKET: 'qa-article',
      S3_PROFILE_BUCKET: 'qa-profile',
    });
    ({ app, port } = await bootApp(0));
  });
  afterAll(async () => {
    await app.close();
  });

  const presign = (path: string, body: unknown, auth?: string) =>
    fetch(`http://127.0.0.1:${port}/uploads/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

  it('토큰이 없거나 틀리면 401', async () => {
    const body = { contentType: 'image/png', size: 100 };
    expect((await presign('presign-article', body)).status).toBe(401);
    expect((await presign('presign-profile', body, 'Bearer nope')).status).toBe(
      401,
    );
  });

  it('사용자 id 는 토큰 sub 에서 꺼내고 본문 userId 는 무시한다. 형식·크기가 서명에 들어간다', async () => {
    const res = await presign(
      'presign-article',
      { userId: '999', contentType: 'image/png', size: 1234 },
      `Bearer ${token('42')}`,
    );
    expect(res.status).toBe(201);
    const { key, putUrl } = (await res.json()) as {
      key: string;
      putUrl: string;
    };
    expect(key).toMatch(/^articles\/42\//);
    expect(new URL(putUrl).searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
  });

  it('이미지가 아니거나 크기가 없거나 10MB 를 넘으면 400', async () => {
    const auth = `Bearer ${token('42')}`;
    expect(
      (
        await presign(
          'presign-profile',
          { contentType: 'text/html', size: 10 },
          auth,
        )
      ).status,
    ).toBe(400);
    expect(
      (await presign('presign-profile', { contentType: 'image/png' }, auth))
        .status,
    ).toBe(400);
    expect(
      (
        await presign(
          'presign-profile',
          { contentType: 'image/png', size: MAX_UPLOAD_BYTES + 1 },
          auth,
        )
      ).status,
    ).toBe(400);
  });
});
