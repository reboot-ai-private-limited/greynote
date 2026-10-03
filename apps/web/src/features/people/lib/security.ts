import type { UserDetailDto } from '@greynote/contracts';
import { passwordError } from './user';

/** What a person must know before they confirm each action: it is shown, not just logged. */
export const RESET_CONSEQUENCE =
  'The employee is signed out on every phone and must use the new password. Their registered phones stay registered.';

export const DEACTIVATE_CONSEQUENCE =
  'The employee is signed out everywhere and can no longer sign in. Their history stays. This cannot be undone from the portal.';

export function resetPasswordError(password: string): string | undefined {
  return password === '' ? 'Enter a new password.' : passwordError(password);
}

export type DeactivateBlock = 'self' | 'already' | null;

/**
 * Why deactivating is not offered, if it is not. You cannot deactivate yourself (nobody would be
 * left to undo it, and the API does not stop you), and an inactive account is already done.
 */
export function deactivateBlock(target: Pick<UserDetailDto, 'id' | 'status'>, selfId: string | undefined): DeactivateBlock {
  if (target.id === selfId) return 'self';
  if (target.status === 'inactive') return 'already';
  return null;
}

export const DEACTIVATE_BLOCK_COPY: Record<'self' | 'already', string> = {
  self: 'You cannot deactivate your own account. Ask another Admin.',
  already: 'This account is deactivated.',
};
