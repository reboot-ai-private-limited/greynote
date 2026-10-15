export const PLATFORMS = ['ANDROID', 'IOS', 'WEB'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Why a session ended. Only reuse of a `ROTATED` token is a theft signal (hld/04 §1) — a token
 * revoked by logout, Admin or a password reset is simply dead, and its device retrying it must
 * not take the user's other devices down with it.
 */
export const REVOKED_REASONS = ['ROTATED', 'LOGOUT', 'ADMIN', 'PASSWORD_RESET', 'THEFT'] as const;
export type RevokedReason = (typeof REVOKED_REASONS)[number];

/** One row per logged-in device. Access tokens are never persisted — only this is. */
export interface UserSession {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: Platform;
  refreshTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
  /** `null` = active. */
  revokedAt: Date | null;
  revokedReason: RevokedReason | null;
  /** The phone's FCM registration token, set by `PUT /auth/push-token`. Only read while the session is live. */
  pushToken?: string | null;
  pushTokenAt?: Date | null;
}
