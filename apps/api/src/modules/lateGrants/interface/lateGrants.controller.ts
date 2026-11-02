import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { Actor } from '../application/actor.js';
import { KIND_REGISTRY } from '../application/kindRegistry.js';
import type { GrantLateUseCase } from '../application/usecases/grantLate.usecase.js';
import type { ListLateUseCase } from '../application/usecases/listLate.usecase.js';
import type { BulkGrantLateUseCase } from '../application/usecases/bulkGrantLate.usecase.js';
import type { ListEligibleUseCase } from '../application/usecases/listEligible.usecase.js';
import type { PreviewLateUseCase } from '../application/usecases/previewLate.usecase.js';
import type { RevokeLateUseCase } from '../application/usecases/revokeLate.usecase.js';
import type { bulkGrantLateBodySchema, eligibleQuerySchema, grantLateBodySchema, listLateQuerySchema, previewLateQuerySchema } from './lateGrants.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export interface LateGrantsUseCases {
  grant: GrantLateUseCase;
  revoke: RevokeLateUseCase;
  list: ListLateUseCase;
  preview: PreviewLateUseCase;
  bulk: BulkGrantLateUseCase;
  eligible: ListEligibleUseCase;
}

export type LateGrantsHandlers = Record<'kinds' | 'grant' | 'list' | 'revoke' | 'preview' | 'bulk' | 'eligible', RequestHandler>;

export function makeLateGrantsControllers(useCases: LateGrantsUseCases): LateGrantsHandlers {
  return {
    kinds: asyncHandler(async (req, res) => {
      const kinds = Object.values(KIND_REGISTRY).map(({ kind, label, group, period }) => ({ kind, label, group, period }));
      sendSuccess(req, res, kinds, 'What can be allowed late.', 200);
    }),
    grant: asyncHandler(async (req, res) => {
      const body = req.body as z.output<typeof grantLateBodySchema>;
      sendSuccess(req, res, await useCases.grant.execute(actorOf(req), body), 'Late submission allowed.', 201);
    }),
    list: asyncHandler(async (req, res) => {
      const { page, pageSize, kind, ...filter } = req.query as unknown as z.output<typeof listLateQuerySchema>;
      const result = await useCases.list.execute(actorOf(req), { ...filter, ...(kind && { kinds: [kind] }) }, { page, pageSize });
      sendSuccess(req, res, result, 'Late-submission exceptions.', 200);
    }),
    revoke: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.revoke.execute(actorOf(req), requiredParam(req.params, 'id')), 'Late-submission exception revoked.', 200);
    }),
    bulk: asyncHandler(async (req, res) => {
      const body = req.body as z.output<typeof bulkGrantLateBodySchema>;
      const result = await useCases.bulk.execute(actorOf(req), body);
      sendSuccess(req, res, result, `Allowed for ${result.granted.length}, skipped ${result.skipped.length}.`, result.granted.length > 0 ? 201 : 200);
    }),
    eligible: asyncHandler(async (req, res) => {
      const { scope, managerId } = req.query as unknown as z.output<typeof eligibleQuerySchema>;
      sendSuccess(req, res, { userIds: await useCases.eligible.execute(actorOf(req), { all: scope === 'all', managerId }) }, 'Employees that can be picked.', 200);
    }),
    preview: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof previewLateQuerySchema>;
      sendSuccess(req, res, await useCases.preview.execute(query), 'Whether a late entry is still possible.', 200);
    }),
  };
}
