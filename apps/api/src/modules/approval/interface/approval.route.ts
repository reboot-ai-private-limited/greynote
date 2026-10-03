import { Router, type RequestHandler } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import {
  approvalIdParamsSchema,
  approveBodySchema,
  bulkDecideBodySchema,
  inboxQuerySchema,
  mineQuerySchema,
  rejectBodySchema,
  reopenBodySchema,
  teamQuerySchema,
  withdrawBodySchema,
} from './approval.schemas.js';

const TAG = 'Approvals';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post',
  path: string,
  summary: string,
  request: { query?: AnyZodObject; params?: AnyZodObject; body?: ZodTypeAny },
): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/approvals${path}`,
    tags: [TAG],
    summary,
    security: bearer,
    request: {
      ...(request.query && { query: request.query }),
      ...(request.params && { params: request.params }),
      ...(request.body && { body: json(request.body) }),
    },
    responses: { 200: { description: 'OK' } },
  });
}

doc('get', '/inbox', 'What I can approve now — manager: direct reports; HR: Leave; Admin: everything open (oldest first)', { query: inboxQuerySchema });
doc('get', '/all', 'Admin: every request in any status, newest first; HR: Leave requests in any status — the History view', { query: inboxQuerySchema });
doc('get', '/team', 'Manager: my downline’s requests; direct reports actionable, deeper levels read-only', { query: teamQuerySchema });
doc('get', '/mine', 'My own requests', { query: mineQuerySchema });
doc('get', '/{id}', 'One request with its full history and what I can do with it', { params: approvalIdParamsSchema });
doc('post', '/{id}/approve', 'Approve (as manager, final approver, or Admin override)', { params: approvalIdParamsSchema, body: approveBodySchema });
doc('post', '/{id}/reject', 'Reject — reason required', { params: approvalIdParamsSchema, body: rejectBodySchema });
doc('post', '/bulk', 'Approve or reject up to 100 at once; per-item results', { body: bulkDecideBodySchema });
doc('post', '/{id}/withdraw', 'Submitter: withdraw before the manager acts', { params: approvalIdParamsSchema, body: withdrawBodySchema });
doc('post', '/{id}/reopen', 'Admin: reopen an approved request for changes — reason required', { params: approvalIdParamsSchema, body: reopenBodySchema });

export function buildApprovalRouter(c: Record<'inbox' | 'all' | 'team' | 'mine' | 'detail' | 'approve' | 'reject' | 'bulk' | 'withdraw' | 'reopen', RequestHandler>): Router {
  const router = Router();
  router.use(authenticate());
  const withId = (body: ZodTypeAny) => validate({ params: approvalIdParamsSchema, body });

  // Literal paths before `/:id`, so "inbox" is never read as an id.
  router.get('/inbox', requireRole('FIELD', 'HR', 'ADMIN'), scopeToFinancialYear({ kind: 'instant', from: 'from', to: 'to', fill: true }), validate({ query: inboxQuerySchema }), c.inbox);
  router.get('/all', requireRole('HR', 'ADMIN'), scopeToFinancialYear({ kind: 'instant', from: 'from', to: 'to', fill: true }), validate({ query: inboxQuerySchema }), c.all);
  router.get('/team', requireRole('FIELD'), scopeToFinancialYear({ kind: 'instant', from: 'from', to: 'to', fill: true }), validate({ query: teamQuerySchema }), c.team);
  router.get('/mine', scopeToFinancialYear({ kind: 'instant', from: 'from', to: 'to', fill: true }), validate({ query: mineQuerySchema }), c.mine);
  router.post('/bulk', requireRole('FIELD', 'HR', 'ADMIN'), validate({ body: bulkDecideBodySchema }), c.bulk);
  router.get('/:id', validate({ params: approvalIdParamsSchema }), c.detail);
  router.post('/:id/approve', withId(approveBodySchema), c.approve);
  router.post('/:id/reject', withId(rejectBodySchema), c.reject);
  router.post('/:id/withdraw', withId(withdrawBodySchema), c.withdraw);
  router.post('/:id/reopen', requireRole('ADMIN'), withId(reopenBodySchema), c.reopen);
  return router;
}
