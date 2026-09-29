import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { ListExpensesUseCase, MarkExpensePaidUseCase } from '../application/usecases/accountantExpenses.usecase.js';
import type { AllocateGiftUseCase, CreateAdminDoctorServiceUseCase, ListDoctorServicesUseCase, ListGiftsUseCase } from '../application/usecases/servicesAndGifts.usecase.js';
import type { OverrideGeofenceUseCase } from '../application/usecases/overrideGeofence.usecase.js';
import type { GetDcrDetailUseCase } from '../application/usecases/getDcrDetail.usecase.js';
import type { Actor, ListAllDcrsUseCase, ListMyDcrsUseCase, ListTeamDcrsUseCase } from '../application/usecases/readDcrs.usecase.js';
import type { listExpensesQuerySchema, allocateGiftBodySchema, doctorServiceFieldsSchema, listDcrsQuerySchema, listGiftsQuerySchema, listServicesQuerySchema, listTeamDcrsQuerySchema, overrideBodySchema } from './field-activity.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export type FieldActivityHandlers = Record<'listDcrs' | 'teamDcrs' | 'getDcr' | 'overrideGeofence' | 'createAdminService' | 'listServices' | 'allocateGift' | 'listGifts' | 'listExpenses' | 'markExpensePaid', RequestHandler>;

export function makeFieldActivityControllers(u: {
  listMine: ListMyDcrsUseCase;
  listAll: ListAllDcrsUseCase;
  listTeam: ListTeamDcrsUseCase;
  get: GetDcrDetailUseCase;
  override: OverrideGeofenceUseCase;
  adminService: CreateAdminDoctorServiceUseCase;
  listServices: ListDoctorServicesUseCase;
  allocateGift: AllocateGiftUseCase;
  listGifts: ListGiftsUseCase;
  listExpenses: ListExpensesUseCase;
  markPaid: MarkExpensePaidUseCase;
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
    overrideGeofence: asyncHandler(async (req, res) => {
      const { comment } = req.body as z.output<typeof overrideBodySchema>;
      const call = await u.override.execute(actorOf(req), requiredParam(req.params, 'id'), requiredParam(req.params, 'callId'), comment);
      sendSuccess(req, res, { id: call.id, geofence: call.geofence }, 'The call was accepted.', 200);
    }),
    createAdminService: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.adminService.execute(actorOf(req).id, req.body as z.output<typeof doctorServiceFieldsSchema>), 'The service was recorded.', 201),
    ),
    listServices: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.listServices.execute(actorOf(req), req.query as unknown as z.output<typeof listServicesQuerySchema>), 'Doctor services.', 200),
    ),
    allocateGift: asyncHandler(async (req, res) => sendSuccess(req, res, await u.allocateGift.execute(actorOf(req).id, req.body as z.output<typeof allocateGiftBodySchema>), 'The gift was allocated.', 201)),
    listGifts: asyncHandler(async (req, res) => sendSuccess(req, res, await u.listGifts.execute(actorOf(req), req.query as unknown as z.output<typeof listGiftsQuerySchema>), 'Doctor gifts.', 200)),
    listExpenses: asyncHandler(async (req, res) => sendSuccess(req, res, await u.listExpenses.execute(req.query as unknown as z.output<typeof listExpensesQuerySchema>), 'Expenses to audit.', 200)),
    markExpensePaid: asyncHandler(async (req, res) => sendSuccess(req, res, await u.markPaid.execute(actorOf(req).id, requiredParam(req.params, 'id')), 'The expense was marked paid.', 200)),
    getDcr: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(actorOf(req), requiredParam(req.params, 'id')), 'Daily report.', 200)),
  };
}
