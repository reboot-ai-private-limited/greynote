import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { FinalizePayrollUseCase, GeneratePayrollUseCase, GetPayrollRunUseCase, ListPayrollRunsUseCase, PayrollClock } from './application/usecases/payroll.usecase.js';
import type { FieldActivityPort, HrPort, IdentityPort } from './domain/ports.js';
import { MongoPayrollAdapter } from './infrastructure/mongoPayroll.adapter.js';
import { makePayrollControllers } from './interface/payroll.controller.js';
import { buildPayrollRouter } from './interface/payroll.route.js';
import type { PayrollPublicContract } from './payroll.public.js';

export interface PayrollContainer {
  contract: PayrollPublicContract;
  buildRouter: () => Router;
}

/**
 * Tier 5, the top of the graph. The Accountant's (or Admin's) monthly sheet (LLD payroll.md, HLD 7). Identity's, HR's,
 * Field Activity's and Config's public contracts, passed in by the composition root. No approval anywhere.
 */
export function buildPayrollContainer(identity: IdentityPort, hr: HrPort, fieldActivity: FieldActivityPort, config: ConfigReader): PayrollContainer {
  const runs = new MongoPayrollAdapter();
  const clock = new PayrollClock(config);
  const generate = new GeneratePayrollUseCase(runs, identity, hr, fieldActivity, clock);
  const finalize = new FinalizePayrollUseCase(runs, clock);
  const get = new GetPayrollRunUseCase(runs);
  const list = new ListPayrollRunsUseCase(runs);
  return {
    contract: { generate: (actor, input) => generate.execute(actor, input), finalize: (id) => finalize.execute(id), get: (id) => get.execute(id), list: (filter) => list.execute(filter) },
    buildRouter: () => buildPayrollRouter(makePayrollControllers({ generate, finalize, get, list })),
  };
}
