import { z } from 'zod';
import { LATE_GRANT_KINDS } from '../domain/lateGrant.entity.js';
import { LATE_GRANT_STATUSES } from '../domain/lateGrant.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const grantIdParamsSchema = z.object({ id: objectIdSchema });

export const grantLateBodySchema = z.object({
  userId: objectIdSchema,
  kind: z.enum(LATE_GRANT_KINDS),
  /** `YYYY-MM-DD` for `DAILY_PLAN`, otherwise `YYYY-MM`. */
  periodKey: z.string().trim().min(1),
  reason: z.string().trim().min(1, 'A reason is required.').max(1000),
  /** When the exception ends (ISO date-time). Omitted: the kind's default length from now. */
  expiresAt: z.coerce.date().optional(),
});

export const listLateQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  userId: objectIdSchema.optional(),
  kind: z.enum(LATE_GRANT_KINDS).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM.').optional(),
  status: z.enum(LATE_GRANT_STATUSES).optional(),
});

export const previewLateQuerySchema = z.object({
  userId: objectIdSchema,
  kind: z.enum(LATE_GRANT_KINDS),
  periodKey: z.string().trim().min(1),
});

export const bulkGrantLateBodySchema = grantLateBodySchema.omit({ userId: true }).extend({
  userIds: z.array(objectIdSchema).min(1, 'Choose at least one employee.').max(500, 'At most 500 employees at a time.'),
});

const eligibleBaseSchema = z.object({
  scope: z.enum(['all', 'team']),
  managerId: objectIdSchema.optional(),
});
export const eligibleQuerySchema = eligibleBaseSchema.refine((q) => q.scope === 'all' || q.managerId !== undefined, { message: 'Say whose team.', path: ['managerId'] });
export { eligibleBaseSchema };
