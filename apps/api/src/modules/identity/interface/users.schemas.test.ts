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
