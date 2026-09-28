import type { Router } from 'express';
import { HolidayCalendar } from './application/holidayCalendar.js';
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
import { MongoLeavePolicyAdapter } from './infrastructure/mongoLeavePolicy.adapter.js';
import { MongoLeaveTypeAdapter } from './infrastructure/mongoLeaveType.adapter.js';
import { makeMastersControllers } from './interface/hr.controller.js';
import { buildMastersRouter } from './interface/hr.route.js';
import type { HrPublicContract } from './hr.public.js';

export interface HrContainer {
  contract: HrPublicContract;
  buildRouter: () => Router;
  /** Adds the starting leave types that are missing — `pnpm seed`, never on boot. */
  seed: () => Promise<void>;
}

/** Identity's and Territory's public contracts, passed in by the composition root. */
export function buildHrContainer(users: UserDirectoryPort, territory: TerritoryPort): HrContainer {

  // 1. Adapters
  const leaveTypes = new MongoLeaveTypeAdapter();
  const policies = new MongoLeavePolicyAdapter();
  const holidays = new MongoHolidayAdapter();

  // 2. Use cases
  const holidayCalendar = new HolidayCalendar(holidays, territory);
  const isLeaveTypeInUse = (id: string) => policies.existsForLeaveType(id);
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
    buildRouter: () => buildMastersRouter(makeMastersControllers(masters)),
    seed: () => leaveTypes.seed(DEFAULT_LEAVE_TYPES),
  };
}
