import { describe, expect, it } from 'vitest';
import { clearAccessRevocation, isAccessRevoked, revokeAccessTokens } from './accessRevocations.js';

describe('access token revocation', () => {
  const at = new Date('2026-10-22T10:00:00Z');
  const sec = (d: Date) => Math.floor(d.getTime() / 1000);

  it('refuses a token issued up to the revocation, not one issued after it', () => {
    revokeAccessTokens('u1', at);
    expect(isAccessRevoked('u1', sec(at) - 60, at)).toBe(true);
    expect(isAccessRevoked('u1', sec(at), at)).toBe(true);
    expect(isAccessRevoked('u1', sec(at) + 1, at)).toBe(false);
    expect(isAccessRevoked('someone-else', sec(at) - 60, at)).toBe(false);
  });

  it('forgets an entry once every token from before it has expired, and on reactivation', () => {
    revokeAccessTokens('u2', at);
    const later = new Date(at.getTime() + 24 * 3600 * 1000);
    expect(isAccessRevoked('u2', sec(at) - 1, later)).toBe(false);
    revokeAccessTokens('u3', at);
    clearAccessRevocation('u3');
    expect(isAccessRevoked('u3', sec(at) - 1, at)).toBe(false);
  });
});
