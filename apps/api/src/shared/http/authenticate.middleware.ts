import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { isAccessRevoked } from './accessRevocations.js';
import { verifyAccessToken } from './jwt.util.js';

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the payload to `req.user`.
 *
 * No DB lookup — see `jwt.util.ts`. A token of a since-deactivated account is refused from memory (`accessRevocations.ts`). A request with no/garbled header, or an expired/invalid
 * token, becomes a 401 via `AppError`, not a silent `req.user === undefined` a downstream
 * handler might forget to check.
 */
export function authenticate(): RequestHandler {
  const handler: RequestHandler = (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      next(AppError.unauthenticated());
      return;
    }

    const payload = verifyAccessToken(token);
    if (isAccessRevoked(payload.sub, payload.iat)) {
      next(AppError.unauthenticated());
      return;
    }
    req.user = payload;
    next();
  };
  // Carried on the handler so the role-by-route test can tell a signed-in route from a public one.
  return Object.assign(handler, { authenticates: true });
}
