import { z } from 'zod';

/**
 * bcrypt silently ignores any password bytes past 72 — accepting a longer password would let two
 * different passwords sharing the same first-72-byte prefix hash identically, at both creation
 * AND login time. Rejecting up front, not truncating, closes that on both ends. Min 8 is an
 * assumption (no doc pins one) — see docs/decision-log.md.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password must be at most 72 bytes long.',
  });
