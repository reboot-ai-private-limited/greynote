import { z } from 'zod';
import { ROLE_NAMES } from '@greynote/contracts';
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
  // Format enforced by the use case (domain/payBand.entity.ts's `isValidDecimalString`) — this
  // schema only checks shape, not the money-specific decimal rule, so there's one place that rule lives.
  baseSalary: z.string().min(1),
  taPerKmRate: z.string().min(1),
  daAmount: z.string().min(1),
});
export const updatePayBandBodySchema = createPayBandBodySchema.partial();

export const masterDataIdParamsSchema = z.object({ id: z.string().min(1) });
