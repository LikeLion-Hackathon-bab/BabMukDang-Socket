import { clientOrigins, socketCorsOrigin } from './cors-origins';

describe('clientOrigins', () => {
  it('없거나 빈 값이면 기본 주소', () => {
    expect(clientOrigins({})).toEqual([
      'https://bab-muk-dang-client.vercel.app',
      'http://localhost:3001',
    ]);
    expect(clientOrigins({ CLIENT_ORIGIN: '' })[0]).toBe(
      'https://bab-muk-dang-client.vercel.app',
    );
    expect(clientOrigins({ CLIENT_ORIGIN: ' , ' })[0]).toBe(
      'https://bab-muk-dang-client.vercel.app',
    );
  });
  it('쉼표 목록을 나누고 공백·빈 항목을 버린다', () => {
    expect(
      clientOrigins({ CLIENT_ORIGIN: 'https://a.app, https://b.app,,' }),
    ).toEqual(['https://a.app', 'https://b.app', 'http://localhost:3001']);
  });
  it('Socket.IO 는 목록에 있는 Origin 만 허용한다', () => {
    process.env.CLIENT_ORIGIN = 'https://a.app';
    const res = (o?: string) => {
      let v: boolean | undefined;
      socketCorsOrigin(o, (_e, allow) => (v = allow));
      return v;
    };
    expect(res('https://a.app')).toBe(true);
    expect(res('https://evil.example')).toBe(false);
    expect(res(undefined)).toBe(true);
    delete process.env.CLIENT_ORIGIN;
  });
});
