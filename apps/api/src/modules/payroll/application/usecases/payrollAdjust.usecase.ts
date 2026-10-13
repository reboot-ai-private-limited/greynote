import { randomUUID } from 'node:crypto';
import { AppError } from '@/shared/errors/AppError.js';
import type { PayrollRunRepositoryPort } from '../../domain/payroll.repository.port.js';
import { PAYROLL_CODES, PayrollRefusal } from '../../domain/payrollRefusal.js';
import type { PayrollAdjustment, PayrollRun } from '../../domain/payrollRun.entity.js';
import type { IdentityPort } from '../../domain/ports.js';
import { adjustmentEffects, dayAdjustmentPaise } from '../payrollCalc.js';
import { PayrollClock, type Actor } from './payroll.usecase.js';

/** The days that can be re-charged: a day that was a working day for the employee. A holiday or a day off cannot be charged. */
const CHARGEABLE_STATUSES = new Set(['PRESENT', 'ABSENT', 'LEAVE', 'STRIKE', 'UNKNOWN']);

/**
 * HR's changes to a draft payroll run (decision-log 2026-10-13): re-charge one day (an absent day not charged, a worked day charged) or add a signed
 * amount to the net, each with a reason. Every change is kept (what the rules gave, what it was set to, who, when) and moves the net; the run keeps
 * the net the rules gave as `originalNetPayablePaise`. Only a draft can change: finalizing locks it. The leave request or attendance behind a
 * day is never rewritten.
 */
export class AdjustPayrollUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly clock: PayrollClock,
    private readonly newId: () => string = randomUUID,
  ) {}

  /** Charges the day `setDays` (0, 0.5 or 1) instead of what the rules gave. */
  async overrideDay(actor: Actor, runId: string, input: { date: string; setDays: number; reason: string }): Promise<PayrollRun> {
    const run = await this.editable(actor, runId);
    const day = run.days.find((d) => d.date === input.date);
    if (!day) throw new PayrollRefusal(PAYROLL_CODES.badDay, 'That day is not in this month’s payroll.');
    if (!CHARGEABLE_STATUSES.has(day.status)) throw new PayrollRefusal(PAYROLL_CODES.badDay, 'A holiday or a day off is not charged, so there is nothing to change.');
    if (![0, 0.5, 1].includes(input.setDays)) throw new PayrollRefusal(PAYROLL_CODES.badDay, 'A day is charged 0, a half or a whole day.');
    const effect = dayAdjustmentPaise(run.baseSalaryPaise, day.deductedDays, input.setDays);
    return this.save(run, { id: this.newId(), kind: 'DAY', date: input.date, ruleDays: day.deductedDays, setDays: input.setDays, amountPaise: effect, reason: input.reason, by: actor.id, byRole: actor.role, at: this.clock.now() });
  }

  /** Adds (positive) or takes off (negative) an amount; never zero. */
  async addAmount(actor: Actor, runId: string, input: { amountPaise: number; reason: string }): Promise<PayrollRun> {
    const run = await this.editable(actor, runId);
    if (!Number.isInteger(input.amountPaise) || input.amountPaise === 0) throw new PayrollRefusal(PAYROLL_CODES.badDay, 'Enter an amount in whole paise, more or less than zero.');
    return this.save(run, { id: this.newId(), kind: 'AMOUNT', date: null, ruleDays: null, setDays: null, amountPaise: input.amountPaise, reason: input.reason, by: actor.id, byRole: actor.role, at: this.clock.now() });
  }

  private async editable(actor: Actor, runId: string): Promise<PayrollRun> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HR') throw AppError.forbidden();
    const run = await this.runs.findById(runId);
    if (!run) throw new PayrollRefusal(PAYROLL_CODES.runNotFound, 'No such payroll run.');
    await this.clock.assertMonthOpen(run.month);
    if (run.status !== 'DRAFT') throw new PayrollRefusal(PAYROLL_CODES.notDraft, 'This payroll run is finalized, so it can no longer be changed.');
    return run;
  }

  private async save(run: PayrollRun, adjustment: PayrollAdjustment): Promise<PayrollRun> {
    const adjustments = [...run.adjustments, adjustment];
    const { totalPaise } = adjustmentEffects(run.baseSalaryPaise, run.days, adjustments);
    const net = run.originalNetPayablePaise + totalPaise;
    if (net < 0) throw new PayrollRefusal(PAYROLL_CODES.negativeNet, 'That would take the net pay below zero.');
    if (!(await this.runs.saveAdjustments(run.id, run.adjustments.length, { adjustments, adjustmentPaise: totalPaise, netPayablePaise: net, originalNetPayablePaise: run.originalNetPayablePaise }))) {
      throw new PayrollRefusal(PAYROLL_CODES.changed, 'This payroll run was finalized or changed just now. Reload and try again.');
    }
    return (await this.runs.findById(run.id)) ?? run;
  }
}

/** The Accountant (or Admin) marks a finalized run's salary as paid, with an optional reference (a transfer id or the like). Once. */
export class PayPayrollUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly clock: PayrollClock,
  ) {}

  async execute(actor: Actor, runId: string, input: { reference?: string | null | undefined }): Promise<PayrollRun> {
    if (actor.role !== 'ACCOUNTANT' && actor.role !== 'ADMIN') throw AppError.forbidden();
    const run = await this.runs.findById(runId);
    if (!run) throw new PayrollRefusal(PAYROLL_CODES.runNotFound, 'No such payroll run.');
    await this.clock.assertMonthOpen(run.month);
    if (run.status !== 'FINALIZED') throw new PayrollRefusal(PAYROLL_CODES.notFinalized, 'Only a finalized payroll run can be marked paid.');
    if (!(await this.runs.markPaid(runId, actor.id, this.clock.now(), input.reference?.trim() || null))) throw new PayrollRefusal(PAYROLL_CODES.alreadyPaid, 'This payroll run is already marked paid.');
    return (await this.runs.findById(runId)) ?? run;
  }
}

export type PayrollStage = 'NOT_GENERATED' | 'DRAFT' | 'FINALIZED' | 'PAID';

export interface PayrollOverviewRow {
  userId: string;
  userName: string;
  employeeCode: string;
  stage: PayrollStage;
  runId: string | null;
  baseSalaryPaise: number | null;
  unpaidLeaveDays: number;
  absentDays: number;
  /** Leave and absent deductions together. */
  deductionPaise: number;
  adjustmentPaise: number;
  netPayablePaise: number | null;
  finalizedAt: Date | null;
  paidAt: Date | null;
}

export interface PayrollOverview {
  month: string;
  /** The first day payroll can be generated: the month is over. */
  generateFrom: string;
  /** Whether the month is over, so it can be generated. */
  canGenerate: boolean;
  rows: PayrollOverviewRow[];
}

export const payrollStageOf = (run: Pick<PayrollRun, 'status' | 'paidAt'> | null): PayrollStage => (!run ? 'NOT_GENERATED' : run.paidAt ? 'PAID' : run.status === 'FINALIZED' ? 'FINALIZED' : 'DRAFT');

/** The month table: every active field employee with where their salary stands, whether or not a run exists yet. */
export class PayrollOverviewUseCase {
  constructor(
    private readonly runs: PayrollRunRepositoryPort,
    private readonly identity: IdentityPort,
    private readonly clock: PayrollClock,
  ) {}

  async execute(actor: Actor, month: string): Promise<PayrollOverview> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HR' && actor.role !== 'ACCOUNTANT') throw AppError.forbidden();
    const runs = await this.runs.list({ month }, 5000);
    const runOf = new Map(runs.map((r) => [r.userId, r]));
    const userIds = [...new Set([...(await this.identity.listActiveFieldUserIds()), ...runs.map((r) => r.userId)])];
    const people = new Map((await this.identity.getUserSummaries(userIds)).map((u) => [u.id, u]));
    const rows = userIds
      .map((userId): PayrollOverviewRow => {
        const r = runOf.get(userId) ?? null;
        return {
          userId,
          userName: people.get(userId)?.name ?? '',
          employeeCode: people.get(userId)?.employeeCode ?? '',
          stage: payrollStageOf(r),
          runId: r?.id ?? null,
          baseSalaryPaise: r?.baseSalaryPaise ?? null,
          unpaidLeaveDays: r?.unpaidLeaveDays ?? 0,
          absentDays: r?.absentDays ?? 0,
          deductionPaise: (r?.leaveDeductionPaise ?? 0) + (r?.absentDeductionPaise ?? 0),
          adjustmentPaise: r?.adjustmentPaise ?? 0,
          netPayablePaise: r?.netPayablePaise ?? null,
          finalizedAt: r?.finalizedAt ?? null,
          paidAt: r?.paidAt ?? null,
        };
      })
      .sort((a, b) => a.userName.localeCompare(b.userName));
    const [y, m] = month.split('-').map(Number) as [number, number];
    const generateFrom = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { month, generateFrom, canGenerate: (await this.clock.today()) >= generateFrom, rows };
  }
}
