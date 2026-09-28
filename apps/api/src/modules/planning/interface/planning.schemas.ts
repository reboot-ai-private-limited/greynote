import { z } from 'zod';
import { parseCalendarDate } from '@/shared/time/businessTime.js';
import { WORKING_TYPES } from '../domain/plan.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

/** A calendar day, `YYYY-MM-DD` — plan dates aren't instants, so no time or offset. */
export const planDateSchema = z.string().refine(
  (v) => {
    try {
      parseCalendarDate(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a date as YYYY-MM-DD.' },
);

export const planIdParamsSchema = z.object({ id: objectIdSchema });

export const planDaySchema = z.object({
  workingType: z.enum(WORKING_TYPES),
  workWith: z.array(objectIdSchema).max(20).default([]),
  routeIds: z.array(objectIdSchema).max(20).default([]),
  remarks: z.string().trim().max(1000).nullish().transform((v) => v || null),
});

export const saveDailyPlanBodySchema = planDaySchema.extend({ planDate: planDateSchema });

/** Both ends inclusive. The unrefined object is what the OpenAPI doc shows. */
export const dateRangeQuerySchema = z.object({ from: planDateSchema, to: planDateSchema });
export const listDailyPlansQuerySchema = dateRangeQuerySchema
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 92, {
    message: 'At most 93 days at a time.',
    path: ['to'],
  });
