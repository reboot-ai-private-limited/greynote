/** One emailed reset code for an Admin. Only the hash of the code is kept; it is single-use, short-lived and limited in wrong tries. */
export interface PasswordResetRequest {
  id: string;
  userId: string;
  otpHash: string;
  expiresAt: Date;
  /** Wrong codes tried against it so far. */
  attempts: number;
  usedAt: Date | null;
  createdAt: Date;
}
