import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { ListDraftsUseCase } from '../application/usecases/listDrafts.usecase.js';
import type { PushRecordsUseCase } from '../application/usecases/pushRecords.usecase.js';
import type { PutDraftsUseCase } from '../application/usecases/putDrafts.usecase.js';
import type { listDraftsQuerySchema, pushBodySchema, putDraftsBodySchema } from './sync.schemas.js';

export type SyncHandlers = Record<'push' | 'putDrafts' | 'listDrafts', RequestHandler>;

function actorOf(req: Request) {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export function makeSyncControllers(u: { push: PushRecordsUseCase; putDrafts: PutDraftsUseCase; listDrafts: ListDraftsUseCase }): SyncHandlers {
  return {
    putDrafts: asyncHandler(async (req, res) => {
      const { drafts } = req.body as z.output<typeof putDraftsBodySchema>;
      const result = await u.putDrafts.execute(actorOf(req), drafts);
      sendSuccess(req, res, result, `${result.summary.stored} backed up.`, 200);
    }),
    listDrafts: asyncHandler(async (req, res) => {
      const { after, limit } = req.query as unknown as z.output<typeof listDraftsQuerySchema>;
      sendSuccess(req, res, await u.listDrafts.execute(actorOf(req), { after: after ?? null, limit }), 'Your unsent records.', 200);
    }),
    push: asyncHandler(async (req, res) => {
      const { records } = req.body as z.output<typeof pushBodySchema>;
      const result = await u.push.execute(
        actorOf(req),
        records.map((r) => ({ ...r, payload: r.payload ?? null })),
      );
      const { synced, alreadySynced, failed } = result.summary;
      sendSuccess(req, res, result, `${synced} synced, ${alreadySynced} already synced, ${failed} failed.`, 200);
    }),
  };
}
