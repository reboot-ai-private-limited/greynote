/** The FCM token each live session carries. Tokens on revoked or expired sessions are never returned. */
export interface PushTokenRepositoryPort {
  /** Stores (or with `null` clears) the token on the caller's live session for this device. `false` when there is no such session. */
  setForDevice(userId: string, deviceId: string, token: string | null): Promise<boolean>;
  /** Removes a token from every session, so a phone handed to another account stops buzzing the old one. */
  clearTokens(tokens: string[]): Promise<void>;
  /** Distinct tokens across the live sessions of these users. */
  listForUsers(userIds: string[]): Promise<string[]>;
}
