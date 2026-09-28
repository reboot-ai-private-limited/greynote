import { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { HolidayCalendar } from './application/holidayCalendar.js';
import { HrCalendar } from './application/hrCalendar.js';
import { LeaveBalances } from './application/leaveBalances.js';
import { AdjustLeaveBalanceUseCase } from './application/usecases/adjustLeaveBalance.usecase.js';
import { GetLeaveBalancesUseCase } from './application/usecases/getLeaveBalances.usecase.js';
import { CreateHolidayUseCase } from './application/usecases/createHoliday.usecase.js';
import { CreateLeaveTypeUseCase } from './application/usecases/createLeaveType.usecase.js';
import { DeleteHolidayUseCase } from './application/usecases/deleteHoliday.usecase.js';
import { ListHolidaysUseCase } from './application/usecases/listHolidays.usecase.js';
import { ListLeavePoliciesUseCase } from './application/usecases/listLeavePolicies.usecase.js';
import { ListLeaveTypesUseCase } from './application/usecases/listLeaveTypes.usecase.js';
import { SetLeavePolicyUseCase } from './application/usecases/setLeavePolicy.usecase.js';
import { UpdateLeaveTypeUseCase } from './application/usecases/updateLeaveType.usecase.js';
import { DEFAULT_LEAVE_TYPES } from './domain/leaveType.entity.js';
import type { TerritoryPort } from './domain/territory.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoHolidayAdapter } from './infrastructure/mongoHoliday.adapter.js';
import { MongoLeaveBalanceAdapter } from './infrastructure/mongoLeaveBalance.adapter.js';
import { MongoLeavePolicyAdapter } from './infrastructure/mongoLeavePolicy.adapter.js';
import { MongoLeaveTypeAdapter } from './infrastructure/mongoLeaveType.adapter.js';
import { makeBalanceControllers, makeMastersControllers } from './interface/hr.controller.js';
import { buildBalancesRouter, buildMastersRouter } from './interface/hr.route.js';
import type { HrPublicContract } from './hr.public.js';

export interface HrContainer {
  contract: HrPublicContract;
  buildRouter: () => Router;
  /** Adds the starting leave types that are missing — `pnpm seed`, never on boot. */
  seed: () => Promise<void>;
}

/** Identity's, Territory's and Config's public contracts, passed in by the composition root. */
export function buildHrContainer(users: UserDirectoryPort, territory: TerritoryPort, config: ConfigReader): HrContainer {

  // 1. Adapters
  const leaveTypes = new MongoLeaveTypeAdapter();
  const policies = new MongoLeavePolicyAdapter();
  const holidays = new MongoHolidayAdapter();
  const balanceRepository = new MongoLeaveBalanceAdapter();

  // 2. Use cases
  const calendar = new HrCalendar(config);
  const holidayCalendar = new HolidayCalendar(holidays, territory);
  const balances = new LeaveBalances(balanceRepository, policies, leaveTypes, users, calendar);
  const isLeaveTypeInUse = async (id: string) =>
    (await policies.existsForLeaveType(id)) || (await balanceRepository.existsForLeaveType(id));
  const masters = {
    listTypes: new ListLeaveTypesUseCase(leaveTypes),
    createType: new CreateLeaveTypeUseCase(leaveTypes),
    updateType: new UpdateLeaveTypeUseCase(leaveTypes, isLeaveTypeInUse),
    listPolicies: new ListLeavePoliciesUseCase(policies, leaveTypes, users),
    setPolicy: new SetLeavePolicyUseCase(policies, leaveTypes, users),
    listHolidays: new ListHolidaysUseCase(holidays, territory),
    createHoliday: new CreateHolidayUseCase(holidays, territory),
    deleteHoliday: new DeleteHolidayUseCase(holidays),
  };

  return {
    contract: {
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
      return router;
    },
    seed: () => leaveTypes.seed(DEFAULT_LEAVE_TYPES),
  };
}
