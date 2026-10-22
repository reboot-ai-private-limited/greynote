import { env } from '@/config/env.js';

/**
 * Accounts whose access tokens stop working before they expire (decision-log 2026-10-22): a deactivated employee is signed out
 * on their very next request, not up to `JWT_ACCESS_TOKEN_TTL_SECONDS` later. A token is refused when it was issued at or before
 * the account's revocation time. Kept in this process's memory, so `authenticate` still reads no database (HLD-04); the API runs
 * as one process, and after a restart the composition root re-fills it from the accounts deactivated within the last token
 * lifetime. An entry is only needed for that long: every token older than that has expired anyway.
 */
const revokedAt = new Map<string, number>();

const ttlSeconds = (): number => env.JWT_ACCESS_TOKEN_TTL_SECONDS;

/** Every access token of `userId` issued up to `at` (default now) is refused from now on. */
export function revokeAccessTokens(userId: string, at: Date = new Date()): void {
  revokedAt.set(userId, Math.floor(at.getTime() / 1000));
}

/** A reactivated account: tokens it is issued from now on work again. */
export function clearAccessRevocation(userId: string): void {
  revokedAt.delete(userId);
}

/** Whether a token of `userId` issued at `issuedAt` (seconds) has been revoked. Drops entries older than a token lifetime. */
export function isAccessRevoked(userId: string, issuedAt: number, now: Date = new Date()): boolean {
  const at = revokedAt.get(userId);
  if (at === undefined) return false;
  if (Math.floor(now.getTime() / 1000) - at > ttlSeconds()) {
    revokedAt.delete(userId);
    return false;
  }
  return issuedAt <= at;
}
