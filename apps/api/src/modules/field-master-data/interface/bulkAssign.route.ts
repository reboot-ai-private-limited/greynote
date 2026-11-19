import { Router, type Request, type RequestHandler } from 'express';
import type { z } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { BulkAssignChemistsUseCase, BulkAssignDistributorsUseCase, BulkAssignDoctorsUseCase } from '../application/usecases/bulkAssign.usecase.js';
import { actorOf } from './field-master-data.controller.js';
import { bulkAssignBodySchema } from './field-master-data.schemas.js';

export type BulkAssignHandlers = Record<'doctors' | 'chemists' | 'distributors', RequestHandler>;

export function makeBulkAssignControllers(u: { doctors: BulkAssignDoctorsUseCase; chemists: BulkAssignChemistsUseCase; distributors: BulkAssignDistributorsUseCase }): BulkAssignHandlers {
  const body = (req: { body: unknown }) => req.body as z.output<typeof bulkAssignBodySchema>;
  const adminId = (req: Request) => actorOf(req).id;
  return {
    doctors: asyncHandler(async (req, res) => sendSuccess(req, res, await u.doctors.execute(body(req).userId, body(req).ids, adminId(req), body(req).removeIds), 'Doctors updated.', 200)),
    chemists: asyncHandler(async (req, res) => sendSuccess(req, res, await u.chemists.execute(body(req).userId, body(req).ids, adminId(req), body(req).removeIds), 'Chemists updated.', 200)),
    distributors: asyncHandler(async (req, res) => sendSuccess(req, res, await u.distributors.execute(body(req).userId, body(req).ids, body(req).removeIds), 'Distributors updated.', 200)),
  };
}

/** Assign several records to one employee at once, from the employee page's picker. Admin; the Accountant too for distributors, as they edit those. */
export function bulkAssignRouter(c: BulkAssignHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.post('/doctors', requireRole('ADMIN'), validate({ body: bulkAssignBodySchema }), c.doctors);
  router.post('/chemists', requireRole('ADMIN'), validate({ body: bulkAssignBodySchema }), c.chemists);
  router.post('/distributors', requireRole('ADMIN', 'ACCOUNTANT'), validate({ body: bulkAssignBodySchema }), c.distributors);
  return router;
}
