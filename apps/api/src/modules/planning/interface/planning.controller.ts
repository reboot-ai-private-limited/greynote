import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { Actor } from '../application/planAccess.js';
import type { AmendDailyPlanUseCase } from '../application/usecases/amendDailyPlan.usecase.js';
import type { CarryOver } from '../application/carryOver.js';
import type { SetDailyPlanDoctorsUseCase } from '../application/usecases/setDailyPlanDoctors.usecase.js';
import type { GetDailyPlanUseCase } from '../application/usecases/getDailyPlan.usecase.js';
import type { GetMonthlyPlanUseCase } from '../application/usecases/getMonthlyPlan.usecase.js';
import type { GrantLateSubmitUseCase } from '../application/usecases/grantLateSubmit.usecase.js';
import type { ListDailyPlansUseCase } from '../application/usecases/listDailyPlans.usecase.js';
import type { ListLateSubmitGrantsUseCase } from '../application/usecases/listLateSubmitGrants.usecase.js';
import type { ListMonthlyPlansUseCase } from '../application/usecases/listMonthlyPlans.usecase.js';
import type { RevokeLateSubmitUseCase } from '../application/usecases/revokeLateSubmit.usecase.js';
import type { SaveMonthlyPlanUseCase } from '../application/usecases/saveMonthlyPlan.usecase.js';
import type { SubmitDailyPlanUseCase } from '../application/usecases/submitDailyPlan.usecase.js';
import type { SubmitMonthlyPlanUseCase } from '../application/usecases/submitMonthlyPlan.usecase.js';
import type {
  amendDailyPlanBodySchema,
  carryOverQuerySchema,
  setDailyPlanDoctorsBodySchema,
  grantLateSubmitBodySchema,
  listDailyPlansQuerySchema,
  listLateSubmitGrantsQuerySchema,
  listMonthlyPlansQuerySchema,
  saveMonthlyPlanBodySchema,
} from './planning.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

type ListDailyQuery = z.output<typeof listDailyPlansQuerySchema>;
type SaveMonthlyBody = z.output<typeof saveMonthlyPlanBodySchema>;
type ListMonthlyQuery = z.output<typeof listMonthlyPlansQuerySchema>;
type GrantBody = z.output<typeof grantLateSubmitBodySchema>;
type ListGrantsQuery = z.output<typeof listLateSubmitGrantsQuerySchema>;

export type PlanningHandlers = Record<
  | 'setDoctors'
  | 'carryOver'
  | 'listDaily'
  | 'getDaily'
  | 'submitDaily'
  | 'saveMonthly'
  | 'listMonthly'
  | 'getMonthly'
  | 'submitMonthly'
  | 'grantLate'
  | 'listLateGrants'
  | 'revokeLate'
  | 'amendDaily',
  RequestHandler
>;

export function makePlanningControllers(useCases: {
  amendDaily: AmendDailyPlanUseCase;
  setDoctors: SetDailyPlanDoctorsUseCase;
  carryOver: CarryOver;
  listDaily: ListDailyPlansUseCase;
  getDaily: GetDailyPlanUseCase;
  submitDaily: SubmitDailyPlanUseCase;
  saveMonthly: SaveMonthlyPlanUseCase;
  listMonthly: ListMonthlyPlansUseCase;
  getMonthly: GetMonthlyPlanUseCase;
  submitMonthly: SubmitMonthlyPlanUseCase;
  grantLate: GrantLateSubmitUseCase;
  listLateGrants: ListLateSubmitGrantsUseCase;
  revokeLate: RevokeLateSubmitUseCase;
}): PlanningHandlers {
  return {
    setDoctors: asyncHandler(async (req, res) => {
      const { planDate, doctorIds } = req.body as z.output<typeof setDailyPlanDoctorsBodySchema>;
      sendSuccess(req, res, await useCases.setDoctors.execute(actorOf(req).id, planDate, doctorIds), 'Doctors saved.', 200);
    }),
    carryOver: asyncHandler(async (req, res) => {
      const { date } = req.query as unknown as z.output<typeof carryOverQuerySchema>;
      sendSuccess(req, res, await useCases.carryOver.pending(actorOf(req).id, date), 'Missed calls carried over to this day.', 200);
    }),
    listDaily: asyncHandler(async (req, res) => {
      const { from, to } = req.query as unknown as ListDailyQuery;
      sendSuccess(req, res, await useCases.listDaily.execute(actorOf(req).id, from, to), 'Your daily plans.', 200);
    }),
    getDaily: asyncHandler(async (req, res) => {
      const plan = await useCases.getDaily.execute(actorOf(req), requiredParam(req.params, 'id'));
      sendSuccess(req, res, plan, 'Daily plan.', 200);
    }),
    submitDaily: asyncHandler(async (req, res) => {
      const request = await useCases.submitDaily.execute(actorOf(req).id, requiredParam(req.params, 'id'));
      sendSuccess(req, res, request, 'Plan submitted for approval.', 200);
    }),
    saveMonthly: asyncHandler(async (req, res) => {
      const { planMonth, entries } = req.body as SaveMonthlyBody;
      const plan = await useCases.saveMonthly.execute(actorOf(req).id, planMonth, entries);
      sendSuccess(req, res, plan, 'Plan saved.', 200);
    }),
    listMonthly: asyncHandler(async (req, res) => {
      const { from, to } = req.query as unknown as ListMonthlyQuery;
      sendSuccess(req, res, await useCases.listMonthly.execute(actorOf(req).id, from, to), 'Your monthly plans.', 200);
    }),
    getMonthly: asyncHandler(async (req, res) => {
      const plan = await useCases.getMonthly.execute(actorOf(req), requiredParam(req.params, 'id'));
      sendSuccess(req, res, plan, 'Monthly plan.', 200);
    }),
    submitMonthly: asyncHandler(async (req, res) => {
      const request = await useCases.submitMonthly.execute(actorOf(req).id, requiredParam(req.params, 'id'));
      sendSuccess(req, res, request, 'Plan submitted for approval.', 200);
    }),
    grantLate: asyncHandler(async (req, res) => {
      const grant = await useCases.grantLate.execute(actorOf(req), req.body as GrantBody);
      sendSuccess(req, res, grant, 'Late submission allowed.', 201);
    }),
    listLateGrants: asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = req.query as unknown as ListGrantsQuery;
      const result = await useCases.listLateGrants.execute(actorOf(req), filter, { page, pageSize });
      sendSuccess(req, res, result, 'Late-submission exceptions.', 200);
    }),
    amendDaily: asyncHandler(async (req, res) => {
      const { reason, ...day } = req.body as z.output<typeof amendDailyPlanBodySchema>;
      const plan = await useCases.amendDaily.execute(actorOf(req), requiredParam(req.params, 'id'), day, reason);
      sendSuccess(req, res, plan, 'Plan amended.', 200);
    }),
    revokeLate: asyncHandler(async (req, res) => {
      const grant = await useCases.revokeLate.execute(actorOf(req), requiredParam(req.params, 'id'));
      sendSuccess(req, res, grant, 'Late-submission exception revoked.', 200);
    }),
  };
}
