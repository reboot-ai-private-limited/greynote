import type { RequestHandler } from 'express';
import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';

/**
 * Role-gate. Must run after `authenticate()` — reads `req.user`, never verifies a token itself.
 *
 * Takes the allowed role list from `@greynote/contracts`, not from `modules/identity/`: `shared/`
 * must never import a module (`shared-is-below-modules`), and this is exactly why `RoleName`
 * lives in the shared contracts package instead.
 */
export function requireRole(...roles: RoleName[]): RequestHandler {
  const handler: RequestHandler = (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthenticated());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
  // Carried on the handler so the role-by-route test can read who each route lets in.
  return Object.assign(handler, { allowedRoles: roles });
}
