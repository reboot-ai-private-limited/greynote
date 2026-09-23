import jwt from 'jsonwebtoken';
import type { AccessTokenPayload } from '@greynote/contracts';
import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';

/**
 * The only file that touches `jsonwebtoken` directly.
 *
 * Access-token verification is a pure signature+expiry check — no DB lookup (HLD-04) — which is
 * exactly what lets `authenticate.middleware.ts` live in `shared/` with zero dependency on the
 * `identity` module. Only `identity`'s login/refresh flows call `signAccessToken`.
 */

export function signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch (cause) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: 'Please sign in to continue.',
      cause,
    });
  }
}
