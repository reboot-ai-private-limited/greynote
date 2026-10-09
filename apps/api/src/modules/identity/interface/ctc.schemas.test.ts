import { describe, expect, it } from 'vitest';
import { assignCtcBodySchema, previewCtcBodySchema } from './ctc.schemas.js';

const base = { ctcAnnualPaise: 14_400_000 };

describe('CTC structure in a request', () => {
  it('is optional, and a partial one gets empty defaults', () => {
    expect(previewCtcBodySchema.parse(base).structure).toBeUndefined();
    expect(
      previewCtcBodySchema.parse({ ...base, structure: { basicBasisPoints: 4000 } }).structure,
    ).toEqual({
      basicBasisPoints: 4000,
      ruleOverrides: {},
      removed: [],
      extras: [],
    });
  });

  it('takes rule changes, removals and added lines', () => {
    const parsed = assignCtcBodySchema.parse({
      ...base,
      effectiveFrom: '2026-10',
      structure: {
        ruleOverrides: { FDA: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1400, of: ['BASIC'] } },
        removed: ['MEDICAL'],
        extras: [
          {
            code: 'CONVEYANCE',
            name: 'Conveyance',
            kind: 'EARNING',
            rule: { type: 'FIXED', amountPaise: 960_000 },
          },
        ],
      },
    });
    expect(parsed.structure?.removed).toEqual(['MEDICAL']);
  });

  it('refuses a malformed code, a nameless line and a percentage over 100', () => {
    const line = { name: 'X', kind: 'EARNING', rule: { type: 'FIXED', amountPaise: 1 } };
    expect(
      previewCtcBodySchema.safeParse({
        ...base,
        structure: { extras: [{ ...line, code: 'bad code' }] },
      }).success,
    ).toBe(false);
    expect(
      previewCtcBodySchema.safeParse({
        ...base,
        structure: { extras: [{ ...line, code: 'OK1', name: ' ' }] },
      }).success,
    ).toBe(false);
    expect(
      previewCtcBodySchema.safeParse({ ...base, structure: { basicBasisPoints: 10_001 } }).success,
    ).toBe(false);
  });
});
