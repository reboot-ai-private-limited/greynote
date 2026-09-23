import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { verifyAccessToken } from './jwt.util.js';

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the payload to `req.user`.
 *
 * No DB lookup — see `jwt.util.ts`. A request with no/garbled header, or an expired/invalid
 * token, becomes a 401 via `AppError`, not a silent `req.user === undefined` a downstream
 * handler might forget to check.
 */
export function authenticate(): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next(AppError.unauthenticated());
      return;
    }

    req.user = verifyAccessToken(token);
    next();
  };
}
