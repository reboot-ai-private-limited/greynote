import { z } from 'zod';
import { APPROVAL_STATUSES } from '../domain/approvalRequest.entity.js';
import { MAX_BULK } from '../application/usecases/bulkDecideApproval.usecase.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const commentSchema = z.string().trim().max(1000);
/** The cycle the client displayed — a decision on a request resubmitted since then is a 409. */
const cycleSchema = z.number().int().positive();
/**
 * An instant with its offset (`2026-09-28T23:59:59.999+05:30`), never a bare date: the server
 * has no business timezone, so "the 28th" is the client's to turn into a start and end.
 */
const instantSchema = z
  .string()
  .datetime({ offset: true, message: 'Must be a date-time with a timezone offset.' })
  .transform((s) => new Date(s));

export const approvalIdParamsSchema = z.object({ id: objectIdSchema });

const listBase = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  kind: z.string().trim().min(1).optional(),
  status: z.enum(APPROVAL_STATUSES).optional(),
  submitterId: objectIdSchema.optional(),
  /** Part of the submitter's name, employee code or email. */
  search: z.string().trim().min(1).max(100).optional(),
  /** Inclusive. */
  from: instantSchema.optional(),
  /** Inclusive — send the end of the last day wanted, not the start of the day after. */
  to: instantSchema.optional(),
});

export const inboxQuerySchema = listBase.extend({
  /** `/all` only: leave out the requests still open. */
  decided: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  /** Admin only: requests from this manager's direct reports. Ignored for other roles. */
  managerId: objectIdSchema.optional(),
});
export const teamQuerySchema = listBase.extend({
  scope: z.enum(['direct', 'indirect', 'all']).default('all'),
});
export const mineQuerySchema = listBase.omit({ submitterId: true });

export const approveBodySchema = z.object({ cycle: cycleSchema, comment: commentSchema.optional() });
export const rejectBodySchema = z.object({ cycle: cycleSchema, comment: commentSchema.min(1, 'A reason is required to reject.') });
export const withdrawBodySchema = z.object({ comment: commentSchema.optional() });
export const reopenBodySchema = z.object({ comment: commentSchema.min(1, 'A reason is required to reopen.') });
export const bulkDecideBodySchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    requests: z
      .array(z.object({ id: objectIdSchema, cycle: cycleSchema }))
      .min(1)
      .max(MAX_BULK),
    comment: commentSchema.optional(),
  })
  .refine((b) => b.decision === 'APPROVE' || (b.comment ?? '').length > 0, {
    message: 'A reason is required to reject.',
    path: ['comment'],
  });
