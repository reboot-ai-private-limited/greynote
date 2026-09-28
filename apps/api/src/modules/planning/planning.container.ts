import type { Router } from 'express';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { PlanDeadlines } from './application/planDeadlines.js';
import { PlanSubmitter } from './application/planSubmitter.js';
import { PlanViews } from './application/planViews.js';
import { GetDailyPlanUseCase } from './application/usecases/getDailyPlan.usecase.js';
import { GetPlanStatusUseCase } from './application/usecases/getPlanStatus.usecase.js';
import { ListDailyPlansUseCase } from './application/usecases/listDailyPlans.usecase.js';
import { SaveDailyPlanUseCase } from './application/usecases/saveDailyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './application/usecases/submitDailyPlan.usecase.js';
import type { ApprovalsPort } from './domain/approvals.port.js';
import type { ConfigProviderPort } from './domain/configProvider.port.js';
import { PLAN_KINDS } from './domain/plan.js';
import type { RouteDirectoryPort } from './domain/routeDirectory.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoDailyPlanAdapter } from './infrastructure/mongoDailyPlan.adapter.js';
import { makePlanningControllers } from './interface/planning.controller.js';
import { buildPlanningRouter } from './interface/planning.route.js';
import type { PlanningPublicContract } from './planning.public.js';

export interface PlanningContainer {
  contract: PlanningPublicContract;
  buildRouter: () => Router;
}

/** Identity's, Territory's, Approval's and Config's public contracts, passed in by the composition root. */
export function buildPlanningContainer(
  users: UserDirectoryPort,
  routes: RouteDirectoryPort,
  approvals: ApprovalsPort,
  config: ConfigProviderPort,
): PlanningContainer {
  // Plans are approved by the submitter's manager, then Admin (unless APPROVAL_MANAGER_ONLY_KINDS
  // lists the kind). Status lives in the approval module, so there's nothing to react to here.
  for (const kind of PLAN_KINDS) approvals.registerKind({ kind, finalApproverRoles: ['ADMIN'] });

  // 1. Adapters
  const dailyPlans = new MongoDailyPlanAdapter();
  const transactions = new MongooseTransactionRunner();

  // 2. Use cases
  const deadlines = new PlanDeadlines(config);
  const views = new PlanViews(approvals, deadlines);
  const submitter = new PlanSubmitter(users, routes, approvals, transactions, deadlines.now);
  const saveDaily = new SaveDailyPlanUseCase(dailyPlans, approvals, views);
  const submitDaily = new SubmitDailyPlanUseCase(dailyPlans, deadlines, submitter);
  const getDaily = new GetDailyPlanUseCase(dailyPlans, users, views);
  const listDaily = new ListDailyPlansUseCase(dailyPlans, views);
  const status = new GetPlanStatusUseCase(dailyPlans, approvals);

  return {
    contract: {
      isDailyPlanApproved: (userId, planDate) => status.isDailyPlanApproved(userId, planDate),
      getDailyPlanStatus: (userId, planDate) => status.daily(userId, planDate),
    },
    buildRouter: () => buildPlanningRouter(makePlanningControllers({ saveDaily, listDaily, getDaily, submitDaily })),
  };
}
