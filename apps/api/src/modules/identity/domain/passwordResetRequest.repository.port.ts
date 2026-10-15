import type { PasswordResetRequest } from './passwordResetRequest.entity.js';

export interface PasswordResetRequestRepositoryPort {
  create(input: Omit<PasswordResetRequest, 'id'>): Promise<PasswordResetRequest>;
  /** Requests made since `since`, for everyone: the daily cap counts these. */
  countCreatedSince(since: Date): Promise<number>;
  /** The newest code for this user that is neither used nor expired at `now`. */
  findOpenForUser(userId: string, now: Date): Promise<PasswordResetRequest | null>;
  /** Adds one wrong try and returns the new count. */
  addAttempt(id: string): Promise<number>;
  /** Closes it; false when it was already closed (a second request racing the first). */
  markUsed(id: string, at: Date): Promise<boolean>;
  /** Closes every open code for the user: a new request replaces the old ones. */
  closeOpenForUser(userId: string, at: Date): Promise<void>;
  /** Removes a request whose mail could not be sent, so a failure does not eat the daily cap. */
  delete(id: string): Promise<void>;
}
