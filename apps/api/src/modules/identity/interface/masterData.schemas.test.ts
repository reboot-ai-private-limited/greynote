import { describe, expect, it } from 'vitest';
import { createDesignationBodySchema, createPayBandBodySchema, updatePayBandBodySchema } from './masterData.schemas.js';

const rates = { taPerKmRatePaise: 750, hqDaPaise: 0, exStationDaPaise: 20_000, outStationDaPaise: 50_000 };

describe('master data request bodies', () => {
  it('request bodies: the range is required, names are trimmed and squashed, the name is bounded', () => {
    const body = { name: '  Senior   Exec ', ctcMinAnnualPaise: 14_400_000, ctcMaxAnnualPaise: 30_000_000, ...rates };
    expect(createPayBandBodySchema.parse(body).name).toBe('Senior Exec');
    expect(createPayBandBodySchema.safeParse({ ...body, ctcMinAnnualPaise: undefined }).success).toBe(false);
    expect(createPayBandBodySchema.safeParse({ ...body, ctcMaxAnnualPaise: 1.5 }).success).toBe(false);
    expect(createPayBandBodySchema.safeParse({ ...body, name: 'x'.repeat(21) }).success).toBe(false);
    expect(createPayBandBodySchema.safeParse({ ...body, name: '   ' }).success).toBe(false);
    expect(updatePayBandBodySchema.safeParse({ hqDaPaise: 5 }).success).toBe(true);
  });

  it('designations: an old client\'s level is dropped, the name is still one of the five', () => {
    expect(createDesignationBodySchema.parse({ name: 'ASM', level: 9 })).toEqual({ name: 'ASM' });
    expect(createDesignationBodySchema.safeParse({ name: 'CEO' }).success).toBe(false);
  });
});
