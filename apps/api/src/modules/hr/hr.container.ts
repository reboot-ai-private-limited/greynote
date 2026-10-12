import { eachDate, weekdayOf } from '@/shared/time/businessTime.js';
import { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { makeHrSource } from './application/syncSnapshot.js';
import { HolidayCalendar } from './application/holidayCalendar.js';
import { ExpireLateLeaves } from './application/expireLateLeaves.js';
import { LeaveApprovalCutoff } from './application/leaveApprovalCutoff.js';
import { LeaveLock, type PayrollFinalizedCheck } from './application/leaveLock.js';
import { Probation } from './application/probation.js';
import { HrCalendar } from './application/hrCalendar.js';
import { LeaveBalances } from './application/leaveBalances.js';
import { makeLeaveLedger } from './application/leaveLedger.js';
import { LeaveLookups } from './application/leaveLookups.js';
import { LeaveProof } from './application/leaveProof.js';
import { LeaveRequests } from './application/leaveRequests.js';
import { CloudinaryProofStorage } from './infrastructure/cloudinaryProofStorage.adapter.js';
import { LeaveViews } from './application/leaveViews.js';
import { GetLeaveUseCase } from './application/usecases/getLeave.usecase.js';
import { ListLeavesUseCase } from './application/usecases/listLeaves.usecase.js';
import { AdjustLeaveBalanceUseCase } from './application/usecases/adjustLeaveBalance.usecase.js';
import { GetLeaveBalancesUseCase } from './application/usecases/getLeaveBalances.usecase.js';
import { CreateHolidayUseCase } from './application/usecases/createHoliday.usecase.js';
import { CreateLeaveTypeUseCase } from './application/usecases/createLeaveType.usecase.js';
import { DeleteHolidayUseCase } from './application/usecases/deleteHoliday.usecase.js';
import { ImportHolidaysUseCase } from './application/usecases/importHolidays.usecase.js';
import { ListHolidaysUseCase } from './application/usecases/listHolidays.usecase.js';
import { ListLeavePoliciesUseCase } from './application/usecases/listLeavePolicies.usecase.js';
import { ListLeaveTypesUseCase } from './application/usecases/listLeaveTypes.usecase.js';
import { SetLeavePolicyUseCase } from './application/usecases/setLeavePolicy.usecase.js';
import { UpdateLeaveTypeUseCase } from './application/usecases/updateLeaveType.usecase.js';
import type { ApprovalsPort } from './domain/approvals.port.js';
import { DEFAULT_LEAVE_TYPES } from './domain/leaveType.entity.js';
import type { TerritoryPort } from './domain/territory.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { MongoLeaveApprovalGrantAdapter } from './infrastructure/mongoLeaveApprovalGrant.adapter.js';
import { MongoHolidayAdapter } from './infrastructure/mongoHoliday.adapter.js';
import { MongoLeaveAdapter } from './infrastructure/mongoLeave.adapter.js';
import { MongoLeaveBalanceAdapter } from './infrastructure/mongoLeaveBalance.adapter.js';
import { MongoLeavePolicyAdapter } from './infrastructure/mongoLeavePolicy.adapter.js';
import { MongoLeaveTypeAdapter } from './infrastructure/mongoLeaveType.adapter.js';
import { makeBalanceControllers, makeLeaveControllers, makeMastersControllers } from './interface/hr.controller.js';
import { buildBalancesRouter, buildLeavesRouter, buildMastersRouter } from './interface/hr.route.js';
import type { HrPublicContract } from './hr.public.js';

export interface HrContainer {
  contract: HrPublicContract;
  buildRouter: () => Router;
  /** Adds the starting leave types that are missing — `pnpm seed`, never on boot. */
  seed: () => Promise<void>;
  /** Rejects leaves that began without an approval, freeing their balance. Returns how many. Run by the server on an interval. */
  expireLateLeaves: () => Promise<number>;
  /** Payroll sits above HR, so the composition root hands HR the question "is this month's salary finalized?" once Payroll exists. */
  bindPayrollLock(check: PayrollFinalizedCheck): void;
}

/** Identity's, Territory's, Approval's, Sync's and Config's public contracts, passed in by the composition root. */
export function buildHrContainer(
  users: UserDirectoryPort,
  territory: TerritoryPort,
  approvals: ApprovalsPort,
  sync: SyncPublicContract,
  config: ConfigReader,
): HrContainer {

  // 1. Adapters
  const leaveTypes = new MongoLeaveTypeAdapter();
  const policies = new MongoLeavePolicyAdapter();
  const holidays = new MongoHolidayAdapter();
  const balanceRepository = new MongoLeaveBalanceAdapter();
  const leaves = new MongoLeaveAdapter();
  const transactions = new MongooseTransactionRunner();

  // Employee → Manager → HR or Admin (client §11.2). The ledger moves a paid leave's days on each
  // decision, in the approval module's transaction.
  const leaveLock = new LeaveLock(config);
  const calendar = new HrCalendar(config);
  const grants = new MongoLeaveApprovalGrantAdapter();
  const cutoff = new LeaveApprovalCutoff(leaves, grants, calendar, config);
  approvals.registerKind({ kind: 'LEAVE', finalApproverRoles: ['HR', 'ADMIN'], onStatusChange: makeLeaveLedger(leaves, balanceRepository, leaveLock, cutoff) });

  // 2. Use cases
  const holidayCalendar = new HolidayCalendar(holidays, territory);
  const probation = new Probation(users, config, calendar);
  const balances = new LeaveBalances(balanceRepository, policies, leaveTypes, users, calendar);
  // What the phone caches of HR: leave types, the MR's balances and the holidays that apply to them.
  sync.registerSource(makeHrSource({ leaveTypes, balances, holidays, territory, calendar }));
  const isLeaveTypeInUse = async (id: string) =>
    (await policies.existsForLeaveType(id)) ||
    (await balanceRepository.existsForLeaveType(id)) ||
    (await leaves.existsForLeaveType(id));
  const leaveViews = new LeaveViews(approvals, leaveTypes);
  const leaveRequests = new LeaveRequests(
    leaves,
    leaveTypes,
    balanceRepository,
    balances,
    calendar,
    holidayCalendar,
    approvals,
    transactions,
    leaveViews,
    probation,
    leaveLock,
  );
  const lookups = new LeaveLookups(leaves, approvals, probation, leaveTypes);
  const createHoliday = new CreateHolidayUseCase(holidays, territory);
  const masters = {
    listTypes: new ListLeaveTypesUseCase(leaveTypes),
    createType: new CreateLeaveTypeUseCase(leaveTypes),
    updateType: new UpdateLeaveTypeUseCase(leaveTypes, isLeaveTypeInUse),
    listPolicies: new ListLeavePoliciesUseCase(policies, leaveTypes, users),
    setPolicy: new SetLeavePolicyUseCase(policies, leaveTypes, users),
    listHolidays: new ListHolidaysUseCase(holidays, territory),
    createHoliday,
    importHolidays: new ImportHolidaysUseCase(holidays, territory, createHoliday),
    deleteHoliday: new DeleteHolidayUseCase(holidays),
  };

  return {
    contract: {
      isOnLeave: (userId, date) => lookups.isOnLeave(userId, date),
      listLeaveDates: (userId, from, to) => lookups.leaveDates(userId, from, to),
      listLeavesForUsers: (userIds, from, to) => lookups.leavesForUsers(userIds, from, to),
      getUnpaidLeaveDays: (userId, month) => lookups.unpaidDays(userId, month),
      listOffDates: async (userId, from, to) => {
        const weeklyOff = await calendar.weeklyOff();
        const holidayDates = await holidayCalendar.datesFor(userId, from, to);
        return eachDate(from, to).filter((d) => weekdayOf(d) === weeklyOff || holidayDates.has(d));
      },
      listHolidayDates: async (userId, from, to) => [...(await holidayCalendar.datesFor(userId, from, to))].sort(),
    },
    buildRouter: () => {
      const router = Router();
      router.use(buildMastersRouter(makeMastersControllers(masters)));
      router.use(
        '/leave-balances',
        buildBalancesRouter(
          makeBalanceControllers({
            get: new GetLeaveBalancesUseCase(balances, users, calendar),
            adjust: new AdjustLeaveBalanceUseCase(balanceRepository, balances),
          }),
        ),
      );
      router.use(
        '/leaves',
        buildLeavesRouter(
          makeLeaveControllers({
            requests: leaveRequests,
            list: new ListLeavesUseCase(leaves, leaveViews),
            get: new GetLeaveUseCase(leaves, users, leaveViews),
            proof: new LeaveProof(leaves, leaveTypes, new CloudinaryProofStorage()),
            cutoff,
          }),
        ),
      );
      return router;
    },
    expireLateLeaves: () => new ExpireLateLeaves(leaves, grants, approvals, calendar).execute(),
    seed: () => leaveTypes.seed(DEFAULT_LEAVE_TYPES),
    bindPayrollLock: (check) => leaveLock.bind(check),
  };
}
