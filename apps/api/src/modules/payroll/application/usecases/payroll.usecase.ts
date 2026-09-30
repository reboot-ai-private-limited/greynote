import { logger } from '@/shared/logging/logger.js';
import { assertTimeZone, businessDate } from '@/shared/time/businessTime.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import type { PayrollFilter, PayrollRunRepositoryPort } from '../../domain/payroll.repository.port.js';
import { PAYROLL_CODES, PayrollRefusal, type PayrollCode } from '../../domain/payrollRefusal.js';
import type { PayrollRun } from '../../domain/payrollRun.entity.js';
import type { FieldActivityPort, HrPort, IdentityPort } from '../../domain/ports.js';
import { leaveDeductionPaise, netPayablePaise } from '../payrollCalc.js';

export interface Actor {
  id: string;
  role: string;
}

const LIMIT = 1000;

export type GenerateOutcome =
  | { userId: string; outcome: 'created' | 'updated'; run: PayrollRun }
  | { userId: string; outcome: 'skipped'; reason: PayrollCode; message: string };

/** Payroll's clock: the business timezone from Config, `now` injectable for tests. */
export class PayrollClock {
  constructor(
    private readonly config: ConfigReader,
    readonly now: () => Date = () => new Date(),
  ) {}
  timeZone(): Promise<string> {
    return readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
  }
  async today(): Promise<string> {
    return businessDate(this.now(), await this.timeZone());
  }
  async dateOf(instant: Date): Promise<string> {
    return businessDate(instant, await this.timeZone());
  }
}

/**
 * The Accountant's (or Admin's) month-end sheet (LLD payroll.md, HLD 7). For each employee, independently: the Pay Band's
 * base salary as it is now (snapshotted), what was paid during the month, the month's approved unpaid leave, the
 * deduction and the net — written as a `DRAFT`, overwriting an earlier draft, never a finalized run. One employee's
 * problem (no Pay Band, already finalized, a fault) is reported for them and never fails the rest.
 */
export class GeneratePayrollUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly identity: IdentityPort,
    private readonly hr: HrPort,
    private readonly fieldActivity: FieldActivityPort,
    private readonly clock: PayrollClock,
  ) {}

  async execute(actor: Actor, input: { month: string; userIds?: string[] | undefined }): Promise<GenerateOutcome[]> {
    // Only a month that is over: generating the unfinished one would freeze a sheet that misses the rest of it.
    if ((await this.clock.today()).slice(0, 7) <= input.month) throw new PayrollRefusal(PAYROLL_CODES.monthNotEnded, `${input.month} has not ended yet. Payroll can be generated once the month is over.`);

    const single = input.userIds?.length === 1;
    const ids = input.userIds ? [...new Set(input.userIds)] : await this.identity.listActiveFieldUserIds();
    const results: GenerateOutcome[] = [];
    for (const userId of ids) {
      try {
        results.push(await this.one(actor, input.month, userId));
      } catch (err) {
        if (!(err instanceof PayrollRefusal)) {
          logger.error({ err, userId, month: input.month }, 'payroll generation failed for one employee');
          results.push({ userId, outcome: 'skipped', reason: PAYROLL_CODES.error, message: 'Something went wrong computing this employee. Try again.' });
          continue;
        }
        // Asked for one employee by name, a refusal is the answer; in a batch it is that employee's line.
        if (single && err.code === PAYROLL_CODES.alreadyFinalized) throw err;
        results.push({ userId, outcome: 'skipped', reason: err.code, message: err.message });
      }
    }
    return results;
  }

  private async one(actor: Actor, month: string, userId: string): Promise<GenerateOutcome> {
    const user = await this.identity.findUserSummary(userId);
    if (!user) throw new PayrollRefusal(PAYROLL_CODES.userNotFound, 'No such employee.');
    if (user.role !== 'FIELD' || user.status !== 'active') throw new PayrollRefusal(PAYROLL_CODES.notFieldEmployee, 'Payroll covers active field employees only.');
    const employment = await this.identity.getEmploymentDetails(userId);
    if (!employment?.payBandId) throw new PayrollRefusal(PAYROLL_CODES.noPayBand, `${user.name} has no Pay Band assigned, so there is no base salary to pay.`);

    const { baseSalaryPaise } = await this.identity.getPayBandRates(userId);
    const paid = await this.fieldActivity.getPaidTaDaTotal(userId, month);
    const unpaidLeaveDays = await this.hr.getUnpaidLeaveDays(userId, month);
    const totalTaDaPaise = paid.taPaise + paid.daPaise;
    const deduction = leaveDeductionPaise(unpaidLeaveDays, baseSalaryPaise);
    const joinedInMonth = employment.dateOfJoining ? (await this.clock.dateOf(employment.dateOfJoining)).startsWith(`${month}-`) : false;

    const saved = await this.runs.saveDraft({
      userId,
      month,
      baseSalaryPaise,
      totalTaDaPaise,
      reimbursementPaise: paid.reimbursementPaise,
      unpaidLeaveDays,
      leaveDeductionPaise: deduction,
      netPayablePaise: netPayablePaise({ baseSalaryPaise, totalTaDaPaise, reimbursementPaise: paid.reimbursementPaise, leaveDeductionPaise: deduction }),
      joinedInMonth,
      generatedBy: actor.id,
      generatedAt: this.clock.now(),
    });
    if (saved.outcome === 'finalized') throw new PayrollRefusal(PAYROLL_CODES.alreadyFinalized, `${user.name}'s payroll for ${month} is already finalized and cannot be regenerated.`);
    return { userId, outcome: saved.outcome, run: saved.run };
  }
}

/** `DRAFT` → `FINALIZED`, once: one conditional update, so of two racing finalizes exactly one wins. */
export class FinalizePayrollUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly clock: PayrollClock,
  ) {}

  async execute(id: string): Promise<PayrollRun> {
    const run = await this.runs.findById(id);
    if (!run) throw new PayrollRefusal(PAYROLL_CODES.runNotFound, 'No such payroll run.');
    if (!(await this.runs.finalize(id, this.clock.now()))) throw new PayrollRefusal(PAYROLL_CODES.alreadyFinalized, 'This payroll run is already finalized.');
    return (await this.runs.findById(id)) ?? run;
  }
}

export class GetPayrollRunUseCase {
  constructor(private readonly runs: PayrollRunRepositoryPort) {}
  async execute(id: string): Promise<PayrollRun> {
    const run = await this.runs.findById(id);
    if (!run) throw new PayrollRefusal(PAYROLL_CODES.runNotFound, 'No such payroll run.');
    return run;
  }
}

export class ListPayrollRunsUseCase {
  constructor(private readonly runs: PayrollRunRepositoryPort) {}
  execute(filter: PayrollFilter): Promise<PayrollRun[]> {
    return this.runs.list(filter, LIMIT);
  }
}

