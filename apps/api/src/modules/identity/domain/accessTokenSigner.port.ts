import type { AccessTokenPayload } from '@greynote/contracts';

/** Thin wrapper around `shared/http/jwt.util.ts`'s `signAccessToken` — the only place identity touches signing. */
export interface AccessTokenSignerPort {
  sign(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string;
}
