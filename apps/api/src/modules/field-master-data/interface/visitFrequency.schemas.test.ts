import { describe, expect, it } from 'vitest';
import { addDoctorBodySchema, createDoctorBodySchema, updateDoctorBodySchema, updateDoctorTargetsBodySchema } from './field-master-data.schemas.js';

describe('visit frequency', () => {
  it('is 1 to 4 visits a month on every way a doctor is saved (2026-10-22)', () => {
    expect(updateDoctorTargetsBodySchema.safeParse({ visitFrequency: 4 }).success).toBe(true);
    expect(updateDoctorTargetsBodySchema.safeParse({ visitFrequency: null }).success).toBe(true);
    expect(updateDoctorTargetsBodySchema.safeParse({ visitFrequency: 5 }).success).toBe(false);
    expect(updateDoctorTargetsBodySchema.safeParse({ visitFrequency: 0 }).success).toBe(false);
    expect(updateDoctorBodySchema.safeParse({ visitFrequency: 5 }).success).toBe(false);
    for (const schema of [createDoctorBodySchema, addDoctorBodySchema]) {
      const issues = schema.safeParse({ visitFrequency: 5 }).error?.issues ?? [];
      expect(issues.some((i) => i.path.join('.') === 'visitFrequency')).toBe(true);
    }
  });
});
