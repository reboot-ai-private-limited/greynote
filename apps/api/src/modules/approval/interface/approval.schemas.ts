import { z } from 'zod';
import { APPROVAL_STATUSES } from '../domain/approvalRequest.entity.js';
import { MAX_BULK } from '../application/usecases/bulkDecideApproval.usecase.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const commentSchema = z.string().trim().max(1000);

export const approvalIdParamsSchema = z.object({ id: objectIdSchema });

const listBase = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  kind: z.string().trim().min(1).optional(),
  status: z.enum(APPROVAL_STATUSES).optional(),
  submitterId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const inboxQuerySchema = listBase.extend({
  /** Admin only: requests from this manager's direct reports. Ignored for other roles. */
  managerId: objectIdSchema.optional(),
});
export const teamQuerySchema = listBase.extend({
  scope: z.enum(['direct', 'indirect', 'all']).default('all'),
});
export const mineQuerySchema = listBase.omit({ submitterId: true });

export const approveBodySchema = z.object({ comment: commentSchema.optional() });
export const rejectBodySchema = z.object({ comment: commentSchema.min(1, 'A reason is required to reject.') });
export const withdrawBodySchema = z.object({ comment: commentSchema.optional() });
export const reopenBodySchema = z.object({ comment: commentSchema.min(1, 'A reason is required to reopen.') });
export const bulkDecideBodySchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    requestIds: z.array(objectIdSchema).min(1).max(MAX_BULK),
    comment: commentSchema.optional(),
  })
  .refine((b) => b.decision === 'APPROVE' || (b.comment ?? '').length > 0, {
    message: 'A reason is required to reject.',
    path: ['comment'],
  });
