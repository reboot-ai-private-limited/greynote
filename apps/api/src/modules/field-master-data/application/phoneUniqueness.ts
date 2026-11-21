import { AppError } from '@/shared/errors/AppError.js';

export { phoneKey, samePhoneRegex } from '../domain/phone.js';

/**
 * One phone number belongs to at most one Doctor, and (separately) to at most one Chemist, among those waiting for approval or active.
 * `find` returns who already has it, leaving out `excludeId` (the record being edited). Throws a 409 naming the field `phone`.
 */
export async function requireUniquePhone(
  find: (phone: string, excludeId?: string) => Promise<{ name: string } | null>,
  phone: string | null | undefined,
  noun: 'doctor' | 'chemist',
  excludeId?: string,
): Promise<void> {
  if (!phone) return;
  const other = await find(phone, excludeId);
  if (other) throw AppError.conflict(`This phone number is already used by ${noun === 'doctor' ? 'Dr. ' : ''}${other.name}. Use a different number.`, { field: 'phone' });
}
