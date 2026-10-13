import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '@/config/env.js';

/**
 * How the refresh token travels.
 *
 * Mobile opts in with `X-Client: mobile` and gets the token in the JSON body, as before. Anything
 * else is treated as a browser: the token is set as an httpOnly cookie and left out of the body,
 * so page JavaScript never sees it. The header is a response-shape switch, not a security
 * boundary — a caller that lies about it only changes where its own token is delivered.
 */

export const REFRESH_COOKIE = 'gn_refresh';
export const CLIENT_HEADER = 'x-client';

/** Scoped to the auth routes so the cookie is never sent with ordinary API calls. */
const COOKIE_PATH = '/api/identity/auth';

export function isMobileClient(req: Request): boolean {
  return req.header(CLIENT_HEADER)?.toLowerCase() === 'mobile';
}

/** The web portal says so explicitly (`X-Client: web`); a caller that sends nothing is not assumed to be it. */
export function isWebClient(req: Request): boolean {
  return req.header(CLIENT_HEADER)?.toLowerCase() === 'web';
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: COOKIE_PATH,
  };
}

/** Moves the refresh token from the body to the cookie for browser clients; mobile is untouched. */
export function deliverRefreshToken<T extends { refreshToken: string }>(
  req: Request,
  res: Response,
  result: T,
): T | Omit<T, 'refreshToken'> {
  if (isMobileClient(req)) return result;
  const { refreshToken, ...rest } = result;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(),
    maxAge: env.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  return rest;
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

/**
 * The refresh token for a refresh/logout call: the body wins (mobile); otherwise the cookie, but
 * only when the caller sent `X-Client`. A custom header cannot be set by a cross-site form post
 * and forces a CORS preflight, so it backs up SameSite=Strict as a CSRF guard.
 */
export function readRefreshToken(req: Request): string | undefined {
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  if (fromBody) return fromBody;
  if (!req.header(CLIENT_HEADER)) return undefined;
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE];
}
