import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { FinalizePayrollUseCase, GeneratePayrollUseCase, GetPayrollRunUseCase, ListMyPayslipsUseCase, ListPayrollRunsUseCase, PayrollClock } from './application/usecases/payroll.usecase.js';
import { proratePaise } from '@/shared/money/paise.js';
import { AdjustPayrollUseCase, PayPayrollUseCase, PayrollOverviewUseCase } from './application/usecases/payrollAdjust.usecase.js';
import { PayrollWarningsUseCase } from './application/usecases/payrollWarnings.usecase.js';
import { PayrollViews } from './application/payrollViews.js';
import type { AttendancePort, HrPort, IdentityPort } from './domain/ports.js';
import { MongoPayrollAdapter } from './infrastructure/mongoPayroll.adapter.js';
import { makePayrollControllers } from './interface/payroll.controller.js';
import { buildPayrollRouter } from './interface/payroll.route.js';
import type { PayrollPublicContract } from './payroll.public.js';

export interface PayrollContainer {
  contract: PayrollPublicContract;
  buildRouter: () => Router;
}

/**
 * Tier 5, the top of the graph. The Accountant's (or Admin's) monthly salary sheet (LLD payroll.md, HLD 7). Identity's, HR's,
 * Attendance's and Config's public contracts, passed in by the composition root. No approval anywhere.
 */
export function buildPayrollContainer(identity: IdentityPort, hr: HrPort, attendance: AttendancePort, config: ConfigReader): PayrollContainer {
  const runs = new MongoPayrollAdapter();
  const clock = new PayrollClock(config);
  const generate = new GeneratePayrollUseCase(runs, identity, hr, attendance, clock);
  const finalize = new FinalizePayrollUseCase(runs, clock);
  const get = new GetPayrollRunUseCase(runs);
  const list = new ListPayrollRunsUseCase(runs);
  const mine = new ListMyPayslipsUseCase(runs);
  const views = new PayrollViews(identity);
  return {
    contract: {
      listRunsForReport: async (range) =>
        (await runs.list(range, 100_000)).map((r) => ({
          runId: r.id,
          userId: r.userId,
          month: r.month,
          status: r.status,
          baseSalaryPaise: r.baseSalaryPaise,
          leaveDeductionPaise: r.leaveDeductionPaise,
          absentDeductionPaise: r.absentDeductionPaise,
          netPayablePaise: r.netPayablePaise,
          employerContributionPaise: proratePaise(r.ctcLines.filter((l) => l.kind === 'EMPLOYER_CONTRIBUTION').reduce((n, l) => n + l.amountPaise, 0), 1, 12),
        })),
      generate: (actor, input) => generate.execute(actor, input), finalize: (id, by) => finalize.execute(id, by), get: (id) => get.execute(id), list: (filter) => list.execute(filter), isMonthFinalized: (userId, month) => runs.isFinalized(userId, month) },
    buildRouter: () => buildPayrollRouter(makePayrollControllers({ generate, finalize, get, list, mine, views, warnings: new PayrollWarningsUseCase(runs, identity, config), overview: new PayrollOverviewUseCase(runs, identity, clock), adjust: new AdjustPayrollUseCase(runs, clock), payRun: new PayPayrollUseCase(runs, clock) })),
  };
}
