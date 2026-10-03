import type { Router } from 'express';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { PlanDeadlines } from './application/planDeadlines.js';
import { PlanSubmitter } from './application/planSubmitter.js';
import { PlanViews } from './application/planViews.js';
import { makePlanningSource } from './application/syncSnapshot.js';
import { makeDailyPlanChangeHandler } from './application/dailyPlanChangeHandler.js';
import { makeMonthlyPlanInheritHandler } from './application/monthlyPlanInheritHandler.js';
import { BackfillInheritedDaysUseCase } from './application/usecases/backfillInheritedDays.usecase.js';
import { AmendDailyPlanUseCase, type DayReportedCheck } from './application/usecases/amendDailyPlan.usecase.js';
import { GetDailyPlanUseCase } from './application/usecases/getDailyPlan.usecase.js';
import { GetMonthlyPlanUseCase } from './application/usecases/getMonthlyPlan.usecase.js';
import { GrantLateSubmitUseCase } from './application/usecases/grantLateSubmit.usecase.js';
import { GetPlanStatusUseCase } from './application/usecases/getPlanStatus.usecase.js';
import { GetDailyPlanChangeUseCase, ListDailyPlanChangesUseCase } from './application/usecases/listDailyPlanChanges.usecase.js';
import { ListDailyPlansUseCase } from './application/usecases/listDailyPlans.usecase.js';
import { ListLateSubmitGrantsUseCase } from './application/usecases/listLateSubmitGrants.usecase.js';
import { ListMonthlyPlansUseCase } from './application/usecases/listMonthlyPlans.usecase.js';
import { RequestDailyPlanChangeUseCase } from './application/usecases/requestDailyPlanChange.usecase.js';
import { RevokeLateSubmitUseCase } from './application/usecases/revokeLateSubmit.usecase.js';
import { SaveDailyPlanUseCase } from './application/usecases/saveDailyPlan.usecase.js';
import { SaveMonthlyPlanUseCase } from './application/usecases/saveMonthlyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './application/usecases/submitDailyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './application/usecases/submitMonthlyPlan.usecase.js';
import type { ApprovalsPort } from './domain/approvals.port.js';
import type { ConfigProviderPort } from './domain/configProvider.port.js';
import { DAILY_PLAN_CHANGE_KIND } from './domain/plan.js';
import type { RouteDirectoryPort } from './domain/routeDirectory.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoDailyPlanAdapter } from './infrastructure/mongoDailyPlan.adapter.js';
import { MongoDailyPlanChangeAdapter } from './infrastructure/mongoDailyPlanChange.adapter.js';
import { MongoLateSubmitGrantAdapter } from './infrastructure/mongoLateSubmitGrant.adapter.js';
import { MongoMonthlyPlanAdapter } from './infrastructure/mongoMonthlyPlan.adapter.js';
import { makePlanningControllers } from './interface/planning.controller.js';
import { buildPlanningRouter } from './interface/planning.route.js';
import type { PlanningPublicContract } from './planning.public.js';

export interface PlanningContainer {
  contract: PlanningPublicContract;
  buildRouter: () => Router;
  /**
   * Planning sits below Field Activity, which needs its contract; so the check "has this day's DCR been submitted" is handed
   * back after both are built. Until then an amend fails closed.
   */
  bindDayReported(check: DayReportedCheck): void;
  /** The one-off `migrate:inherit-monthly` script's entry point. */
  backfillInheritedDays(apply: boolean): Promise<{ approvedMonthlyPlans: number; dailyPlansWritten: number }>;
}

/** Identity's, Territory's, Approval's and Config's public contracts, passed in by the composition root. */
export function buildPlanningContainer(
  users: UserDirectoryPort,
  routes: RouteDirectoryPort,
  approvals: ApprovalsPort,
  sync: SyncPublicContract,
  config: ConfigProviderPort,
): PlanningContainer {
  // 1. Adapters
  const dailyPlans = new MongoDailyPlanAdapter();
  const dailyPlanChanges = new MongoDailyPlanChangeAdapter();
  const monthlyPlans = new MongoMonthlyPlanAdapter();
  const grants = new MongoLateSubmitGrantAdapter();
  const transactions = new MongooseTransactionRunner();

  // 2. Use cases
  const deadlines = new PlanDeadlines(config);
  // Plans are approved by the submitter's manager, then Admin (unless APPROVAL_MANAGER_ONLY_KINDS lists the kind). A Daily Plan's
  // status lives in the approval module; an approved Monthly Plan writes its days into Daily Plans (see below).
  approvals.registerKind({ kind: 'DAILY_PLAN', finalApproverRoles: ['ADMIN'] });
  approvals.registerKind({ kind: 'MONTHLY_PLAN', finalApproverRoles: ['ADMIN'], onStatusChange: makeMonthlyPlanInheritHandler(monthlyPlans, dailyPlans, approvals, deadlines) });
  const views = new PlanViews(approvals, grants, deadlines);
  const submitter = new PlanSubmitter(users, routes, approvals, grants, transactions, deadlines.now);
  const saveDaily = new SaveDailyPlanUseCase(dailyPlans, approvals, views);
  const submitDaily = new SubmitDailyPlanUseCase(dailyPlans, deadlines, submitter);
  const getDaily = new GetDailyPlanUseCase(dailyPlans, users, views);
  const listDaily = new ListDailyPlansUseCase(dailyPlans, views);
  const saveMonthly = new SaveMonthlyPlanUseCase(monthlyPlans, approvals, views);
  const submitMonthly = new SubmitMonthlyPlanUseCase(monthlyPlans, deadlines, submitter);
  const getMonthly = new GetMonthlyPlanUseCase(monthlyPlans, users, views);
  const listMonthly = new ListMonthlyPlansUseCase(monthlyPlans, views);
  const status = new GetPlanStatusUseCase(dailyPlans, monthlyPlans, approvals);
  const grantLate = new GrantLateSubmitUseCase(grants, users, config, deadlines.now);
  const listLateGrants = new ListLateSubmitGrantsUseCase(grants, users, deadlines.now);
  const revokeLate = new RevokeLateSubmitUseCase(grants, deadlines.now);

  // An in-day change to an approved Daily Plan (client §2.6) is its own request, and the manager's
  // approval is the decision — no Admin stage, whatever APPROVAL_MANAGER_ONLY_KINDS says. Approving
  // it writes the change into the plan, in the approval's transaction.
  approvals.registerKind({
    kind: DAILY_PLAN_CHANGE_KIND,
    finalApproverRoles: ['ADMIN'],
    managerOnly: true,
    onStatusChange: makeDailyPlanChangeHandler(dailyPlanChanges, dailyPlans, approvals, deadlines),
  });
  // What the phone caches of Planning: the MR's own Plans, with their status for the day's gate.
  sync.registerSource(makePlanningSource({ deadlines, daily: listDaily, monthly: listMonthly }));
  let dayReported: DayReportedCheck = async () => {
    throw new Error('Planning: the day-reported check was never bound.');
  };
  const amendDaily = new AmendDailyPlanUseCase(dailyPlans, users, submitter, deadlines, views, () => dayReported);
  const requestChange = new RequestDailyPlanChangeUseCase(dailyPlans, dailyPlanChanges, approvals, users, submitter, deadlines, transactions);
  const listChanges = new ListDailyPlanChangesUseCase(dailyPlans, dailyPlanChanges, approvals, users);
  const getChange = new GetDailyPlanChangeUseCase(dailyPlanChanges, approvals, users);

  return {
    contract: {
      isDailyPlanApproved: (userId, planDate) => status.isDailyPlanApproved(userId, planDate),
      getDailyPlanDay: (userId, planDate) => status.day(userId, planDate),
      getDailyPlanStatus: (userId, planDate) => status.daily(userId, planDate),
      getMonthlyPlanStatus: (userId, planMonth) => status.monthly(userId, planMonth),
    },
    backfillInheritedDays: (apply) => new BackfillInheritedDaysUseCase(monthlyPlans, dailyPlans, approvals, deadlines, transactions).execute(apply),
    bindDayReported: (check) => {
      dayReported = check;
    },
    buildRouter: () =>
      buildPlanningRouter(
        makePlanningControllers({
          saveDaily,
          listDaily,
          getDaily,
          submitDaily,
          saveMonthly,
          listMonthly,
          getMonthly,
          submitMonthly,
          grantLate,
          listLateGrants,
          revokeLate,
          requestChange,
          amendDaily,
          listChanges,
          getChange,
        }),
      ),
  };
}
