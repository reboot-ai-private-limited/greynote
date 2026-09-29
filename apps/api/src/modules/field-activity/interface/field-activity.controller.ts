import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { GetDcrDetailUseCase } from '../application/usecases/getDcrDetail.usecase.js';
import type { Actor, ListAllDcrsUseCase, ListMyDcrsUseCase, ListTeamDcrsUseCase } from '../application/usecases/readDcrs.usecase.js';
import type { listDcrsQuerySchema, listTeamDcrsQuerySchema } from './field-activity.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export type FieldActivityHandlers = Record<'listDcrs' | 'teamDcrs' | 'getDcr', RequestHandler>;

export function makeFieldActivityControllers(u: {
  listMine: ListMyDcrsUseCase;
  listAll: ListAllDcrsUseCase;
  listTeam: ListTeamDcrsUseCase;
  get: GetDcrDetailUseCase;
}): FieldActivityHandlers {
  return {
    // FIELD: their own. ADMIN: anyone's — `userId` is required, so "everyone's" is never an accident.
    listDcrs: asyncHandler(async (req, res) => {
      const { from, to, userId } = req.query as unknown as z.output<typeof listDcrsQuerySchema>;
      const actor = actorOf(req);
      if (actor.role === 'ADMIN') {
        if (!userId) throw AppError.badRequest('Say whose reports to list.', { field: 'userId' });
        return sendSuccess(req, res, await u.listAll.execute(from, to, userId), 'Daily reports.', 200);
      }
      sendSuccess(req, res, await u.listMine.execute(actor.id, from, to), 'Your daily reports.', 200);
    }),
    teamDcrs: asyncHandler(async (req, res) => {
      const { from, to, userId } = req.query as unknown as z.output<typeof listTeamDcrsQuerySchema>;
      sendSuccess(req, res, await u.listTeam.execute(actorOf(req), from, to, userId ?? null), 'Your team’s daily reports.', 200);
    }),
    getDcr: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(actorOf(req), requiredParam(req.params, 'id')), 'Daily report.', 200)),
  };
}
