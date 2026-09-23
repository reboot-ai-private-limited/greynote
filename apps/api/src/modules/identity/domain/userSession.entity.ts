export const PLATFORMS = ['ANDROID', 'IOS', 'WEB'] as const;
export type Platform = (typeof PLATFORMS)[number];

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
}
