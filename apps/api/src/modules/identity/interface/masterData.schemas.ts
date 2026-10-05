import { z } from 'zod';
import { ROLE_NAMES } from '@greynote/contracts';
import { paiseSchema } from '@/shared/money/paise.js';
import { DESIGNATION_NAMES } from '../domain/designation.entity.js';
import { PAY_BAND_NAMES } from '../domain/payBand.entity.js';

export const createRoleBodySchema = z.object({ name: z.enum(ROLE_NAMES) });
export const updateRoleBodySchema = z.object({ name: z.enum(ROLE_NAMES) });

export const createDesignationBodySchema = z.object({
  name: z.enum(DESIGNATION_NAMES),
  level: z.number().int(),
});
export const updateDesignationBodySchema = createDesignationBodySchema.partial();

export const createPayBandBodySchema = z.object({
  name: z.enum(PAY_BAND_NAMES),
  // Whole paise (₹1 = 100): ₹7.50 per km is 750. A decimal is a 400, not a rounding.
  baseSalaryPaise: paiseSchema,
  suggestedCtcAnnualPaise: paiseSchema.nullable().default(null),
  taPerKmRatePaise: paiseSchema,
  hqDaPaise: paiseSchema,
  exStationDaPaise: paiseSchema,
  outStationDaPaise: paiseSchema,
});
export const updatePayBandBodySchema = createPayBandBodySchema.partial();

export const masterDataIdParamsSchema = z.object({ id: z.string().min(1) });
