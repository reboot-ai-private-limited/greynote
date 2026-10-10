import { logger } from '@/shared/logging/logger.js';
import { assertTimeZone, businessDate } from '@/shared/time/businessTime.js';
import { readConfig, readDayStart, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { PayrollFilter, PayrollRunRepositoryPort } from '../../domain/payroll.repository.port.js';
import { PAYROLL_CODES, PayrollRefusal, type PayrollCode } from '../../domain/payrollRefusal.js';
import type { PayrollRun } from '../../domain/payrollRun.entity.js';
import type { AttendancePort, HrPort, IdentityPort } from '../../domain/ports.js';
import { absentDeductionPaise, chargeableAbsentDays, leaveDeductionPaise, monthlyGrossPaise, netPayablePaise } from '../payrollCalc.js';

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
    return businessDate(this.now(), await this.timeZone(), await readDayStart(this.config));
  }
  async dateOf(instant: Date): Promise<string> {
    return businessDate(instant, await this.timeZone(), await readDayStart(this.config));
  }
  /** A date of record (the joining date) read in the business timezone, not shifted by the day start. */
  async calendarDateOf(instant: Date): Promise<string> {
    return businessDate(instant, await this.timeZone());
  }
  /** A month inside a closed financial year can no longer be generated or finalized. */
  assertMonthOpen(month: string): Promise<void> {
    return assertFinancialYearOpen(this.config, `${month}-01`, `Payroll for ${month}`);
  }
}

/**
 * The Accountant's (or Admin's) salary sheet (LLD payroll.md, HLD 7). For each employee, independently: the CTC in force for
 * the month (its monthly gross, snapshotted), the month's approved unpaid leave, the deduction and the net (`base − deduction`; TA/DA
 * and reimbursements are paid separately, on the 15th) — written as a `DRAFT`, overwriting an earlier draft, never a finalized run. One employee's
 * problem (no CTC, already finalized, a fault) is reported for them and never fails the rest.
 */
export class GeneratePayrollUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly identity: IdentityPort,
    private readonly hr: HrPort,
    private readonly attendance: AttendancePort,
    private readonly clock: PayrollClock,
  ) {}

  async execute(actor: Actor, input: { month: string; userIds?: string[] | undefined }): Promise<GenerateOutcome[]> {
    // Only a month that is over: generating the unfinished one would freeze a sheet that misses the rest of it.
    if ((await this.clock.today()).slice(0, 7) <= input.month) throw new PayrollRefusal(PAYROLL_CODES.monthNotEnded, `${input.month} has not ended yet. Payroll can be generated once the month is over.`);

    await this.clock.assertMonthOpen(input.month);
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
    const ctc = await this.identity.getCtcForMonth(userId, month);
    if (!ctc) throw new PayrollRefusal(PAYROLL_CODES.noCtc, `${user.name} has no CTC in force for ${month}, so there is no salary to pay.`);

    const baseSalaryPaise = monthlyGrossPaise(ctc.lines);
    const unpaidLeaveDays = await this.hr.getUnpaidLeaveDays(userId, month);
    const deduction = leaveDeductionPaise(unpaidLeaveDays, baseSalaryPaise);
    // Working days with no report, leave or strike cost a day's pay too (decision-log 2026-10-06, K20); never more than a month with the leave.
    const absentDays = chargeableAbsentDays(unpaidLeaveDays, (await this.attendance.countDeductibleDays(userId, month)).deductibleDays);
    const absentDeduction = absentDeductionPaise(absentDays, baseSalaryPaise);
    const joinedInMonth = employment?.dateOfJoining ? (await this.clock.calendarDateOf(employment.dateOfJoining)).startsWith(`${month}-`) : false;

    const saved = await this.runs.saveDraft({
      userId,
      month,
      baseSalaryPaise,
      ctcAnnualPaise: ctc.ctcAnnualPaise,
      ctcEffectiveFrom: ctc.effectiveFrom,
      ctcLines: ctc.lines,
      // TA/DA and reimbursements are not part of salary: they are paid in the expense payout on the 15th.
      totalTaDaPaise: 0,
      reimbursementPaise: 0,
      esiNumber: employment?.esiNumber ?? null,
      unpaidLeaveDays,
      leaveDeductionPaise: deduction,
      absentDays,
      absentDeductionPaise: absentDeduction,
      netPayablePaise: netPayablePaise({ baseSalaryPaise, totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: deduction, absentDeductionPaise: absentDeduction }),
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
    await this.clock.assertMonthOpen(run.month);
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

