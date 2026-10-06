import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { Actor } from '../application/actor.js';
import type { CreateHolidayUseCase } from '../application/usecases/createHoliday.usecase.js';
import type { AdjustLeaveBalanceUseCase } from '../application/usecases/adjustLeaveBalance.usecase.js';
import type { CreateLeaveTypeUseCase } from '../application/usecases/createLeaveType.usecase.js';
import type { GetLeaveBalancesUseCase } from '../application/usecases/getLeaveBalances.usecase.js';
import type { GetLeaveUseCase } from '../application/usecases/getLeave.usecase.js';
import type { ListLeavesUseCase } from '../application/usecases/listLeaves.usecase.js';
import type { LeaveProof } from '../application/leaveProof.js';
import type { LeaveRequests } from '../application/leaveRequests.js';
import type { DeleteHolidayUseCase } from '../application/usecases/deleteHoliday.usecase.js';
import type { ListHolidaysUseCase } from '../application/usecases/listHolidays.usecase.js';
import type { ListLeavePoliciesUseCase } from '../application/usecases/listLeavePolicies.usecase.js';
import type { ListLeaveTypesUseCase } from '../application/usecases/listLeaveTypes.usecase.js';
import type { SetLeavePolicyUseCase } from '../application/usecases/setLeavePolicy.usecase.js';
import type { UpdateLeaveTypeUseCase } from '../application/usecases/updateLeaveType.usecase.js';
import type {
  adjustBalanceBodySchema,
  balanceQuerySchema,
  createHolidayBodySchema,
  leaveBodySchema,
  leavesQuerySchema,
  listHolidaysQuerySchema,
  myLeavesQuerySchema,
} from './hr.schemas.js';

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

export type BalanceHandlers = Record<'myBalances' | 'userBalances' | 'adjustBalance', RequestHandler>;

export function makeBalanceControllers(u: { get: GetLeaveBalancesUseCase; adjust: AdjustLeaveBalanceUseCase }): BalanceHandlers {
  const year = (req: Request) => (req.query as unknown as z.output<typeof balanceQuerySchema>).year;
  return {
    myBalances: asyncHandler(async (req, res) => {
      const actor = actorOf(req);
      sendSuccess(req, res, await u.get.execute(actor, actor.id, year(req)), 'Your leave balances.', 200);
    }),
    userBalances: asyncHandler(async (req, res) => {
      const result = await u.get.execute(actorOf(req), requiredParam(req.params, 'userId'), year(req));
      sendSuccess(req, res, result, 'Leave balances.', 200);
    }),
    adjustBalance: asyncHandler(async (req, res) => {
      const body = req.body as z.output<typeof adjustBalanceBodySchema>;
      const balance = await u.adjust.execute({
        ...body,
        userId: requiredParam(req.params, 'userId'),
        leaveTypeId: requiredParam(req.params, 'leaveTypeId'),
        actorId: actorOf(req).id,
      });
      sendSuccess(req, res, balance, 'Leave balance adjusted.', 200);
    }),
  };
}

export type LeaveHandlers = Record<'requestLeave' | 'editLeave' | 'myLeaves' | 'allLeaves' | 'getLeave' | 'addProof' | 'removeProof', RequestHandler>;

export function makeLeaveControllers(u: { requests: LeaveRequests; list: ListLeavesUseCase; get: GetLeaveUseCase; proof: LeaveProof }): LeaveHandlers {
  return {
    addProof: asyncHandler(async (req, res) => {
      if (!req.file) throw AppError.badRequest('A file is required.', { field: 'file' });
      const files = await u.proof.add(actorOf(req).id, requiredParam(req.params, 'id'), { buffer: req.file.buffer, name: req.file.originalname });
      sendSuccess(req, res, files, 'Proof attached.', 201);
    }),
    removeProof: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await u.proof.remove(actorOf(req).id, requiredParam(req.params, 'id'), requiredParam(req.params, 'attachmentId')), 'Proof removed.', 200);
    }),
    requestLeave: asyncHandler(async (req, res) => {
      const leave = await u.requests.request(actorOf(req).id, req.body as z.output<typeof leaveBodySchema>);
      sendSuccess(req, res, leave, 'Leave requested.', 201);
    }),
    editLeave: asyncHandler(async (req, res) => {
      const leave = await u.requests.edit(actorOf(req).id, requiredParam(req.params, 'id'), req.body as z.output<typeof leaveBodySchema>);
      sendSuccess(req, res, leave, 'Leave updated and resubmitted.', 200);
    }),
    myLeaves: asyncHandler(async (req, res) => {
      const { page, pageSize, ...range } = req.query as unknown as z.output<typeof myLeavesQuerySchema>;
      sendSuccess(req, res, await u.list.mine(actorOf(req).id, range, { page, pageSize }), 'Your leaves.', 200);
    }),
    allLeaves: asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = req.query as unknown as z.output<typeof leavesQuerySchema>;
      sendSuccess(req, res, await u.list.all(filter, { page, pageSize }), 'Leaves.', 200);
    }),
    getLeave: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await u.get.execute(actorOf(req), requiredParam(req.params, 'id')), 'Leave.', 200);
    }),
  };
}
