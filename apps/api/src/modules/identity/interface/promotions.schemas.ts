import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const optionalId = objectId.nullish().transform((v) => v ?? null);

export const promotionIdParamsSchema = z.object({ promotionId: objectId });
export const promotionListQuerySchema = z.object({ status: z.enum(['SCHEDULED', 'APPLIED', 'CANCELLED']).optional() });

export const promotionUserParamsSchema = z.object({ id: objectId });

/** An omitted or null `to*` field leaves that part as it is. */
export const promotionBodySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be a month as YYYY-MM.'),
  toDesignationId: optionalId,
  toPayBandId: optionalId,
  toManagerId: optionalId,
  ctc: z
    .object({
      ctcAnnualPaise: paiseSchema.refine((v) => v > 0, 'CTC must be more than zero.'),
      overrides: z.record(z.string().min(1), paiseSchema).optional(),
    })
    .nullish()
    .transform((v) => v ?? null),
  teamMoves: z.array(z.object({ userId: objectId, toManagerId: objectId })).max(500),
  reason: z.string().trim().max(200).nullish(),
});
