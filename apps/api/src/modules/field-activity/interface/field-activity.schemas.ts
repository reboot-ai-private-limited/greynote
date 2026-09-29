import { z } from 'zod';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const idParamsSchema = z.object({ id: objectIdSchema });

/** Both ends inclusive, at most ~13 months. */
const rangeFields = { from: calendarDateSchema, to: calendarDateSchema };
const rangeRules = <T extends { from: string; to: string }>(schema: z.ZodType<T>) =>
  schema
    .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
    .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 400, { message: 'At most 400 days at a time.', path: ['to'] });

export const listDcrsQuerySchema = rangeRules(z.object({ ...rangeFields, userId: objectIdSchema.optional() }));
export const listTeamDcrsQuerySchema = rangeRules(z.object({ ...rangeFields, userId: objectIdSchema.optional() }));

/** The payload of a `DCR_SUBMIT` sync record. */
export const dcrSubmitPayloadSchema = z.object({ reportDate: calendarDateSchema });
