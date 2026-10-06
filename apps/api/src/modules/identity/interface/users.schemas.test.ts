import { describe, expect, it } from 'vitest';
import { updateUserBodySchema } from './users.schemas.js';

describe('updateUserBodySchema — clearing', () => {
  it('accepts null for the three optional fields', () => {
    const parsed = updateUserBodySchema.safeParse({
      basicDetails: { guardianName: null, qualification: null, dateOfJoining: null },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.basicDetails).toEqual({ guardianName: null, qualification: null, dateOfJoining: null });
    }
  });

  it('keeps a missing key missing, so it means "leave alone"', () => {
    const parsed = updateUserBodySchema.parse({ basicDetails: { name: 'Asha' } });
    expect(parsed.basicDetails).toEqual({ name: 'Asha' });
    expect('guardianName' in (parsed.basicDetails ?? {})).toBe(false);
  });

  it('still refuses null, and an empty string, for the fields that gate being active', () => {
    for (const field of ['name', 'mobileNumber', 'dateOfBirth']) {
      expect(updateUserBodySchema.safeParse({ basicDetails: { [field]: null } }).success).toBe(false);
    }
    expect(updateUserBodySchema.safeParse({ basicDetails: { guardianName: '' } }).success).toBe(false);
    expect(updateUserBodySchema.safeParse({ designationId: null }).success).toBe(false);
    expect(updateUserBodySchema.safeParse({ managerId: null }).success).toBe(false);
  });
});

describe('updateUserBodySchema — ESI number and probation months', () => {
  const parse = (basicDetails: unknown) => updateUserBodySchema.safeParse({ basicDetails });

  it('accepts exactly 17 digits, and null to clear', () => {
    expect(parse({ esiNumber: '12345678901234567' }).success).toBe(true);
    expect(parse({ esiNumber: null }).success).toBe(true);
  });

  it('refuses anything else, naming the rule', () => {
    for (const bad of ['1234567890123456', '123456789012345678', '1234567890123456a', '', ' 12345678901234567']) {
      expect(parse({ esiNumber: bad }).success).toBe(false);
    }
    const result = parse({ esiNumber: '123' });
    expect(!result.success && result.error.issues[0]?.message).toBe('The ESI number is exactly 17 digits.');
  });

  it('probation months are whole numbers from 0 to 36, or null', () => {
    for (const ok of [0, 6, 36, null]) expect(parse({ probationMonths: ok }).success).toBe(true);
    for (const bad of [-1, 37, 1.5, '6']) expect(parse({ probationMonths: bad }).success).toBe(false);
  });
});
