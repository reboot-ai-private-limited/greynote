import type { AccessTokenPayload } from '@greynote/contracts';
import { signAccessToken } from '@/shared/http/jwt.util.js';
import type { AccessTokenSignerPort } from '../domain/accessTokenSigner.port.js';

/** Wraps `shared/http/jwt.util.ts` — the only place identity touches signing. */
export class JwtAccessTokenSigner implements AccessTokenSignerPort {
  sign(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
    return signAccessToken(payload);
  }
}
