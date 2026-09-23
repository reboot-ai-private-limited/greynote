import type { AccessTokenPayload } from '@greynote/contracts';

/**
 * Augments Express's `Request` with the authenticated caller, set by `authenticate.middleware.ts`.
 * Lives in `shared/` (below every module) since the type it references, `AccessTokenPayload`,
 * itself lives in `@greynote/contracts` for the same boundary reason — see `jwt.util.ts`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
