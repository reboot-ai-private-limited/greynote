import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { Actor } from '../application/actor.js';
import type { CreateHolidayUseCase } from '../application/usecases/createHoliday.usecase.js';
import type { CreateLeaveTypeUseCase } from '../application/usecases/createLeaveType.usecase.js';
import type { DeleteHolidayUseCase } from '../application/usecases/deleteHoliday.usecase.js';
import type { ListHolidaysUseCase } from '../application/usecases/listHolidays.usecase.js';
import type { ListLeavePoliciesUseCase } from '../application/usecases/listLeavePolicies.usecase.js';
import type { ListLeaveTypesUseCase } from '../application/usecases/listLeaveTypes.usecase.js';
import type { SetLeavePolicyUseCase } from '../application/usecases/setLeavePolicy.usecase.js';
import type { UpdateLeaveTypeUseCase } from '../application/usecases/updateLeaveType.usecase.js';
import type { createHolidayBodySchema, listHolidaysQuerySchema } from './hr.schemas.js';

export function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export type MastersHandlers = Record<
  'listTypes' | 'createType' | 'updateType' | 'listPolicies' | 'setPolicy' | 'listHolidays' | 'createHoliday' | 'deleteHoliday',
  RequestHandler
>;

export function makeMastersControllers(u: {
  listTypes: ListLeaveTypesUseCase;
  createType: CreateLeaveTypeUseCase;
  updateType: UpdateLeaveTypeUseCase;
  listPolicies: ListLeavePoliciesUseCase;
  setPolicy: SetLeavePolicyUseCase;
  listHolidays: ListHolidaysUseCase;
  createHoliday: CreateHolidayUseCase;
  deleteHoliday: DeleteHolidayUseCase;
}): MastersHandlers {
  return {
    listTypes: asyncHandler(async (req, res) => sendSuccess(req, res, await u.listTypes.execute(), 'Leave types.', 200)),
    createType: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.createType.execute(req.body), 'Leave type created.', 201),
    ),
    updateType: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.updateType.execute(requiredParam(req.params, 'id'), req.body), 'Leave type updated.', 200),
    ),
    listPolicies: asyncHandler(async (req, res) => sendSuccess(req, res, await u.listPolicies.execute(), 'Leave Master.', 200)),
    setPolicy: asyncHandler(async (req, res) => {
      const policy = await u.setPolicy.execute({
        payBandId: requiredParam(req.params, 'payBandId'),
        leaveTypeId: requiredParam(req.params, 'leaveTypeId'),
        defaultDays: req.body.defaultDays,
        actorId: actorOf(req).id,
      });
      sendSuccess(req, res, policy, 'Default days set.', 200);
    }),
    listHolidays: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listHolidaysQuerySchema>;
      sendSuccess(req, res, await u.listHolidays.execute(actorOf(req), query), 'Holidays.', 200);
    }),
    createHoliday: asyncHandler(async (req, res) => {
      const holiday = await u.createHoliday.execute(req.body as z.output<typeof createHolidayBodySchema>, actorOf(req).id);
      sendSuccess(req, res, holiday, 'Holiday added.', 201);
    }),
    deleteHoliday: asyncHandler(async (req, res) => {
      await u.deleteHoliday.execute(requiredParam(req.params, 'id'));
      sendSuccess(req, res, null, 'Holiday removed.', 200);
    }),
  };
}
