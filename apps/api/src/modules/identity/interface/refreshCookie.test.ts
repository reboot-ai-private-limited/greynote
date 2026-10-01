import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env.js', () => ({ env: { JWT_REFRESH_TOKEN_TTL_DAYS: 30 }, isProduction: false }));

const { deliverRefreshToken, readRefreshToken, clearRefreshCookie, REFRESH_COOKIE } = await import(
  './refreshCookie.js'
);

function makeReq(opts: { headers?: Record<string, string>; body?: unknown; cookies?: Record<string, string> }): Request {
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    header: (name: string) => headers[name.toLowerCase()],
    body: opts.body ?? {},
    cookies: opts.cookies ?? {},
  } as unknown as Request;
}

function makeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('deliverRefreshToken', () => {
  const result = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };

  it('keeps the refresh token in the body for X-Client: mobile', () => {
    const res = makeRes();
    expect(deliverRefreshToken(makeReq({ headers: { 'X-Client': 'mobile' } }), res, result)).toEqual(result);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('moves it into an httpOnly cookie for everyone else', () => {
    const res = makeRes();
    const body = deliverRefreshToken(makeReq({}), res, result);
    expect(body).toEqual({ accessToken: 'a', expiresIn: 900 });
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'r',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/identity/auth' }),
    );
  });
});

describe('readRefreshToken', () => {
  it('prefers the body', () => {
    const req = makeReq({ body: { refreshToken: 'body' }, cookies: { [REFRESH_COOKIE]: 'cookie' } });
    expect(readRefreshToken(req)).toBe('body');
  });

  it('reads the cookie only when X-Client is present', () => {
    expect(readRefreshToken(makeReq({ cookies: { [REFRESH_COOKIE]: 'cookie' } }))).toBeUndefined();
    expect(
      readRefreshToken(makeReq({ headers: { 'X-Client': 'web' }, cookies: { [REFRESH_COOKIE]: 'cookie' } })),
    ).toBe('cookie');
  });
});

describe('clearRefreshCookie', () => {
  it('clears with the same path so the browser actually drops it', () => {
    const res = makeRes();
    clearRefreshCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/api/identity/auth' }));
  });
});
