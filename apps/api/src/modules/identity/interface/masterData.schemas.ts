import { z } from 'zod';
import { ROLE_NAMES } from '@greynote/contracts';
import { paiseSchema } from '@/shared/money/paise.js';
import { DESIGNATION_NAMES } from '../domain/designation.entity.js';
import { PAY_BAND_NAME_MAX } from '../domain/payBand.entity.js';

export const createRoleBodySchema = z.object({ name: z.enum(ROLE_NAMES) });
export const updateRoleBodySchema = z.object({ name: z.enum(ROLE_NAMES) });

// The rank (level) follows from the name — MR 1 … NSM 5, fixed in the code — so it is not part of the request.
export const createDesignationBodySchema = z.object({ name: z.enum(DESIGNATION_NAMES) });

export const createPayBandBodySchema = z.object({
  name: z.string().trim().min(1).max(PAY_BAND_NAME_MAX).transform((v) => v.replace(/\s+/g, ' ')),
  // Whole paise (₹1 = 100): ₹7.50 per km is 750. A decimal is a 400, not a rounding.
  taPerKmRatePaise: paiseSchema,
  hqDaPaise: paiseSchema,
  exStationDaPaise: paiseSchema,
  outStationDaPaise: paiseSchema,
});
export const updatePayBandBodySchema = createPayBandBodySchema.partial();

export const masterDataIdParamsSchema = z.object({ id: z.string().min(1) });
