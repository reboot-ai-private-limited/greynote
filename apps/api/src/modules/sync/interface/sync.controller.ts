import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { PushRecordsUseCase } from '../application/usecases/pushRecords.usecase.js';
import type { pushBodySchema } from './sync.schemas.js';

export type SyncHandlers = Record<'push', RequestHandler>;

function actorOf(req: Request) {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export function makeSyncControllers(u: { push: PushRecordsUseCase }): SyncHandlers {
  return {
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
