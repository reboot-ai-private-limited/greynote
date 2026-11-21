import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { phoneKey, requireUniquePhone, samePhoneRegex } from './phoneUniqueness.js';

describe('phoneKey', () => {
  it('treats the same number typed three ways as one', () => {
    expect(phoneKey('9433231829')).toBe('9433231829');
    expect(phoneKey('+919433231829')).toBe('9433231829');
    expect(phoneKey('09433231829')).toBe('9433231829');
    expect(phoneKey('+91 94332 31829')).toBe('9433231829');
  });
});

describe('samePhoneRegex', () => {
  it('matches other spellings of the number and nothing else', () => {
    const re = samePhoneRegex('9433231829');
    expect(re.test('+919433231829')).toBe(true);
    expect(re.test('9433231829')).toBe(true);
    expect(re.test('9433231828')).toBe(false);
    expect(re.test('19433231829x')).toBe(false);
  });
});

describe('requireUniquePhone', () => {
  it('passes when nobody has it, or no phone is given', async () => {
    await expect(requireUniquePhone(async () => null, '9433231829', 'doctor')).resolves.toBeUndefined();
    await expect(requireUniquePhone(async () => ({ name: 'X' }), null, 'doctor')).resolves.toBeUndefined();
  });

  it('refuses with a 409 on the phone field, naming who has it', async () => {
    const err = await requireUniquePhone(async () => ({ name: 'Asha Rao' }), '9433231829', 'doctor').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).publicDetails).toEqual({ field: 'phone' });
    expect((err as AppError).message).toContain('Dr. Asha Rao');
  });

  it('passes the record being edited so it never blocks itself', async () => {
    let seen: string | undefined;
    await requireUniquePhone(async (_p, ex) => ((seen = ex), null), '9433231829', 'chemist', 'abc');
    expect(seen).toBe('abc');
  });
});
