import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';
import { calendarMonthSchema } from '@/shared/time/calendarSchemas.js';

const basisPoints = z.number().int().min(0).max(10_000);

export const payComponentRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PERCENT_OF_CTC'), basisPoints }),
  z.object({ type: z.literal('PERCENT_OF_COMPONENTS'), basisPoints, of: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('FIXED'), amountPaise: paiseSchema }),
  z.object({ type: z.literal('BALANCER') }),
]);

const kindSchema = z.enum(['EARNING', 'EMPLOYER_CONTRIBUTION']);

export const createPayComponentBodySchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,23}$/, 'Use capitals, digits and underscores, e.g. HRA.'),
  name: z.string().trim().min(1).max(60),
  kind: kindSchema,
  rule: payComponentRuleSchema,
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
});
// The code is what overrides and other components refer to, so it never changes.
export const updatePayComponentBodySchema = createPayComponentBodySchema.omit({ code: true }).partial();

const overridesSchema = z.record(z.string().min(1), paiseSchema);
const ctcAmountSchema = paiseSchema.refine((v) => v > 0, 'CTC must be more than zero.');

export const previewCtcBodySchema = z.object({ ctcAnnualPaise: ctcAmountSchema, overrides: overridesSchema.optional() });

export const assignCtcBodySchema = z.object({
  ctcAnnualPaise: ctcAmountSchema,
  effectiveFrom: calendarMonthSchema,
  overrides: overridesSchema.optional(),
  reason: z.string().trim().max(200).nullish(),
});

export const reapplyCtcBodySchema = z.object({
  effectiveFrom: calendarMonthSchema,
  reason: z.string().trim().max(200).nullish(),
  userIds: z.array(z.string().min(1)).optional(),
});

export const ctcUserParamsSchema = z.object({ id: z.string().min(1) });
