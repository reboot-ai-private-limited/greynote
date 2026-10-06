import { describe, expect, it } from 'vitest';
import { promotionBodySchema } from './promotions.schemas.js';

const id = 'a'.repeat(24);
const base = { effectiveFrom: '2026-11', teamMoves: [] };

describe('promotion request body', () => {
  it('takes a month and a team, and reads a missing change as "leave it" (null)', () => {
    expect(promotionBodySchema.parse(base)).toMatchObject({ toDesignationId: null, toPayBandId: null, toManagerId: null, ctc: null });
  });

  it('refuses a bad month, a bad id, and a CTC that is zero or not whole paise', () => {
    expect(promotionBodySchema.safeParse({ ...base, effectiveFrom: '2026-13' }).success).toBe(false);
    expect(promotionBodySchema.safeParse({ ...base, effectiveFrom: '2026-11-01' }).success).toBe(false);
    expect(promotionBodySchema.safeParse({ ...base, toManagerId: 'x' }).success).toBe(false);
    expect(promotionBodySchema.safeParse({ ...base, teamMoves: [{ userId: id, toManagerId: 'x' }] }).success).toBe(false);
    expect(promotionBodySchema.safeParse({ ...base, ctc: { ctcAnnualPaise: 0 } }).success).toBe(false);
    expect(promotionBodySchema.safeParse({ ...base, ctc: { ctcAnnualPaise: 1.5 } }).success).toBe(false);
  });

  it('accepts the whole request', () => {
    expect(
      promotionBodySchema.safeParse({ ...base, toDesignationId: id, toPayBandId: id, toManagerId: id, ctc: { ctcAnnualPaise: 30_000_000, overrides: { MEDICAL: 600_000 } }, teamMoves: [{ userId: id, toManagerId: id }], reason: ' review ' }).success,
    ).toBe(true);
  });
});
