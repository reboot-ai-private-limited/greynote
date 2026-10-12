import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { BulkDecideApprovalUseCase } from '../application/usecases/bulkDecideApproval.usecase.js';
import type { DecideApprovalUseCase } from '../application/usecases/decideApproval.usecase.js';
import type { GetApprovalDetailUseCase } from '../application/usecases/getApprovalDetail.usecase.js';
import type { ListApprovalsUseCase } from '../application/usecases/listApprovals.usecase.js';
import type { ReopenApprovalUseCase } from '../application/usecases/reopenApproval.usecase.js';
import type { WithdrawApprovalUseCase } from '../application/usecases/withdrawApproval.usecase.js';
import type { ApprovalStatus } from '../domain/approvalRequest.entity.js';
import type { Actor } from '../domain/approvalRules.js';
import type { bulkDecideBodySchema } from './approval.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

/** `validate()` has already parsed the query into its schema's output. */
type ListQuery = {
  page: number;
  pageSize: number;
  kind?: string;
  status?: ApprovalStatus;
  submitterId?: string;
  managerId?: string;
  from?: Date;
  to?: Date;
  scope?: 'direct' | 'indirect' | 'all';
};
type BulkBody = z.output<typeof bulkDecideBodySchema>;

const splitQuery = (req: Request) => {
  const { page, pageSize, scope, ...filters } = req.query as unknown as ListQuery;
  return { page: { page, pageSize }, filters, scope: scope ?? 'all' };
};

export function makeApprovalControllers(useCases: {
  list: ListApprovalsUseCase;
  detail: GetApprovalDetailUseCase;
  decide: DecideApprovalUseCase;
  bulk: BulkDecideApprovalUseCase;
  withdraw: WithdrawApprovalUseCase;
  reopen: ReopenApprovalUseCase;
}): Record<'inbox' | 'inboxSummary' | 'all' | 'team' | 'mine' | 'detail' | 'approve' | 'reject' | 'bulk' | 'withdraw' | 'reopen', RequestHandler> {
  const decide = (decision: 'APPROVE' | 'REJECT'): RequestHandler =>
    asyncHandler(async (req, res) => {
      const updated = await useCases.decide.execute({
        requestId: requiredParam(req.params, 'id'),
        actor: actorOf(req),
        decision,
        comment: req.body.comment,
        expectedCycle: req.body.cycle,
      });
      sendSuccess(req, res, updated, decision === 'APPROVE' ? 'Approved.' : 'Rejected.', 200);
    });

  return {
    inbox: asyncHandler(async (req, res) => {
      const { page, filters } = splitQuery(req);
      sendSuccess(req, res, await useCases.list.inbox(actorOf(req), filters, page), 'Approvals waiting on you.', 200);
    }),
    inboxSummary: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.list.inboxSummary(actorOf(req)), 'Approvals waiting on you, counted.', 200);
    }),
    all: asyncHandler(async (req, res) => {
      const { page, filters } = splitQuery(req);
      sendSuccess(req, res, await useCases.list.all(actorOf(req), filters, page), 'Approval requests.', 200);
    }),
    team: asyncHandler(async (req, res) => {
      const { page, filters, scope } = splitQuery(req);
      sendSuccess(req, res, await useCases.list.team(actorOf(req), scope, filters, page), 'Team requests.', 200);
    }),
    mine: asyncHandler(async (req, res) => {
      const { page, filters } = splitQuery(req);
      sendSuccess(req, res, await useCases.list.mine(actorOf(req), filters, page), 'Your requests.', 200);
    }),
    detail: asyncHandler(async (req, res) => {
      const detail = await useCases.detail.execute(requiredParam(req.params, 'id'), actorOf(req));
      sendSuccess(req, res, detail, 'Approval request.', 200);
    }),
    approve: decide('APPROVE'),
    reject: decide('REJECT'),
    bulk: asyncHandler(async (req, res) => {
      const body = req.body as BulkBody;
      const results = await useCases.bulk.execute({
        requests: body.requests.map((r) => ({ requestId: r.id, expectedCycle: r.cycle })),
        actor: actorOf(req),
        decision: body.decision,
        comment: body.comment,
      });
      const done = results.filter((r) => r.ok).length;
      sendSuccess(req, res, { results }, `${done} of ${results.length} done.`, 200);
    }),
    withdraw: asyncHandler(async (req, res) => {
      const updated = await useCases.withdraw.execute(requiredParam(req.params, 'id'), actorOf(req), req.body.comment);
      sendSuccess(req, res, updated, 'Withdrawn.', 200);
    }),
    reopen: asyncHandler(async (req, res) => {
      const updated = await useCases.reopen.execute(requiredParam(req.params, 'id'), actorOf(req), req.body.comment);
      sendSuccess(req, res, updated, 'Reopened for changes.', 200);
    }),
  };
}
