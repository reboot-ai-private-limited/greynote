import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { Paise } from '@/shared/money/paise.js';
import { monthRange, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import { toAttachmentView, type Expense, type ExpenseAttachmentView } from '../../domain/expense.entity.js';
import type { ExpenseMonthRepositoryPort, ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { ProofStoragePort } from '../../domain/proofStorage.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrClock } from '../dcrClock.js';
import { monthHasPaidRows } from './expenseMonthGrants.usecase.js';
import type { ExpenseMonthDeadlines } from '../expenseMonthDeadlines.js';
import type { ExpenseGrantPhase } from '../../domain/expenseMonthGrant.entity.js';
import type { ExpenseMonthGrantRepositoryPort } from '../../domain/expenseMonthGrant.repository.port.js';
import type { Actor } from './readDcrs.usecase.js';

/** The approval kind of one employee's month of expenses. Its record id is the `ExpenseMonth` id. */
export const EXPENSE_MONTH_KIND = 'EXPENSE_MONTH';

export type ExpenseMonthStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ExpenseDayLine {
  date: string;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  /** The employee's own entries for the day (editable while the month is). */
  others: Array<{ id: string; amountPaise: number; remarks: string | null; attachments: ExpenseAttachmentView[] }>;
}
export interface ExpenseStatementView {
  userId: string;
  month: string;
  status: ExpenseMonthStatus;
  requestId: string | null;
  /** The month is over, so it can be submitted and approved. */
  monthEnded: boolean;
  /** The employee may add, change and delete `OTHER` entries. */
  editable: boolean;
  canSubmit: boolean;
  days: ExpenseDayLine[];
  totals: { taPaise: number; daPaise: number; otherPaise: number; totalPaise: number };
  /** What was sent to the approver, if submitted; differs from `totals` if a DCR's TA/DA changed since. */
  submittedTotals: { taPaise: number; daPaise: number; otherPaise: number; totalPaise: number } | null;
  /** Payment of the month's rows, once approved: how much the Accountant has settled. */
  paidPaise: number;
  /** The end of the day the month must be sent / approved by (ISO instants); after it only an exception lets it through. */
  deadlines: { submitBy: string; approveBy: string };
  /** The open exception, if any, for each deadline: when it ends (ISO). */
  exceptions: { submitUntil: string | null; approveUntil: string | null };
  /** The send deadline has passed and there is no exception: the employee can no longer submit. */
  submitLate: boolean;
}
export interface ExpenseMonthSummaryView {
  month: string;
  status: ExpenseMonthStatus;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  paidPaise: number;
}

const taOf = (rows: Expense[]) => rows.filter((r) => r.type === 'TA').reduce((a, r) => a + r.amountPaise, 0);
const daOf = (rows: Expense[]) => rows.filter((r) => r.type === 'DA').reduce((a, r) => a + r.amountPaise, 0);
const otherOf = (rows: Expense[]) => rows.filter((r) => r.type !== 'TA' && r.type !== 'DA').reduce((a, r) => a + r.amountPaise, 0);
const totalsOf = (rows: Expense[]) => {
  const t = { taPaise: taOf(rows), daPaise: daOf(rows), otherPaise: otherOf(rows) };
  return { ...t, totalPaise: t.taPaise + t.daPaise + t.otherPaise };
};

const statusOf = (request: { status: ApprovalStatus } | null): ExpenseMonthStatus => {
  if (!request) return 'DRAFT';
  if (request.status === 'APPROVED') return 'APPROVED';
  if (request.status === 'SUBMITTED' || request.status === 'MANAGER_APPROVED') return 'SUBMITTED';
  return request.status === 'REJECTED' ? 'REJECTED' : 'DRAFT'; // withdrawn / reopened: back to the employee
};

/**
 * The monthly expense statement (decision-log 2026-10-10): per employee and month, TA and DA the server computed from approved
 * DCRs plus the employee's own dated `OTHER` entries. The employee submits it once the month is over; the manager or Admin
 * approves it (one stage — the kind is manager-only, Admin overrides). Approval is what makes the rows payable.
 */
export class ExpenseMonthService {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly months: ExpenseMonthRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly clock: DcrClock,
    private readonly config: ConfigReader,
    private readonly transactions: TransactionRunnerPort,
    private readonly storage: ProofStoragePort,
    private readonly grants: ExpenseMonthGrantRepositoryPort,
    private readonly deadlines: ExpenseMonthDeadlines,
  ) {}

  /**
   * The exception that lets `phase` happen after its deadline, or `null` while the deadline has not passed. Throws `code` when it has
   * passed and there is none.
   */
  private async lateException(userId: string, month: string, phase: ExpenseGrantPhase, code: string, message: string) {
    const now = this.deadlines.now();
    const deadline = phase === 'SUBMIT' ? await this.deadlines.submit(month) : await this.deadlines.approval(month);
    if (now <= deadline) return null;
    const grant = await this.grants.findUsable(userId, month, phase, now);
    if (!grant) throw AppError.conflict(message, { code });
    return grant;
  }

  /** Runs inside the approval's transaction: approval makes the month's rows payable; sending it back takes that away. */
  async onStatusChange(recordId: string, status: ApprovalStatus, ctx: TransactionContext): Promise<void> {
    const record = await this.months.findById(recordId);
    if (!record) return;
    if (status === 'APPROVED') {
      // Past the approval deadline only an exception lets the approval through; a throw here rolls the approval back.
      const grant = await this.lateException(record.userId, record.month, 'APPROVE', 'EXPENSE_APPROVAL_LATE', 'The deadline to approve this month’s expenses has passed. Ask Admin to allow it.');
      if (grant && !(await this.grants.consume(grant.id, this.deadlines.now(), ctx))) throw AppError.conflict('That exception was used or ended just now. Try again.', { code: 'EXPENSE_APPROVAL_LATE' });
      await this.expenses.setMonthApproved(record.userId, monthRange(record.month), true, ctx);
    } else if (status === 'REOPENED' && (await monthHasPaidRows(this.expenses, record.userId, record.month))) {
      throw AppError.conflict('Part of this month has already been paid, so it can no longer be reopened.', { code: 'EXPENSE_MONTH_PAID' });
    } else if (status === 'REJECTED' || status === 'REOPENED' || status === 'WITHDRAWN') await this.expenses.setMonthApproved(record.userId, monthRange(record.month), false, ctx);
  }

  /** The owner, their managers (any level) and Admin may read a statement. */
  private async assertCanRead(actor: Actor, userId: string): Promise<void> {
    if (actor.id === userId || actor.role === 'ADMIN') return;
    if (!(await this.users.getManagerChain(userId)).some((m) => m.id === actor.id)) throw AppError.forbidden();
  }

  private async monthEnded(month: string): Promise<boolean> {
    return (await this.clock.today()) > monthRange(month).to;
  }

  async statement(actor: Actor, userId: string, month: string): Promise<ExpenseStatementView> {
    parseCalendarMonth(month);
    await this.assertCanRead(actor, userId);
    const range = monthRange(month);
    const [rows, record] = await Promise.all([this.expenses.listForUserRange(userId, range), this.months.find(userId, month)]);
    const request = record ? await this.approvals.getForRecord(EXPENSE_MONTH_KIND, record.id) : null;
    const status = statusOf(request);
    const monthEnded = await this.monthEnded(month);
    const byDate = new Map<string, Expense[]>();
    for (const r of rows) byDate.set(r.reportDate, [...(byDate.get(r.reportDate) ?? []), r]);
    const days: ExpenseDayLine[] = [...byDate.entries()].map(([date, dayRows]) => ({
      date,
      ...totalsOf(dayRows),
      others: dayRows.filter((r) => r.type === 'OTHER').map((r) => ({ id: r.id, amountPaise: r.amountPaise, remarks: r.remarks, attachments: r.attachments.map(toAttachmentView) })),
    }));
    const totals = totalsOf(rows);
    const editable = status === 'DRAFT' || status === 'REJECTED';
    const now = this.deadlines.now();
    const [submitBy, approveBy, submitGrant, approveGrant] = await Promise.all([
      this.deadlines.submit(month),
      this.deadlines.approval(month),
      this.grants.findUsable(userId, month, 'SUBMIT', now),
      this.grants.findUsable(userId, month, 'APPROVE', now),
    ]);
    const submitLate = now > submitBy && !submitGrant;
    return {
      userId,
      month,
      status,
      requestId: request?.id ?? null,
      monthEnded,
      editable,
      canSubmit: editable && monthEnded && totals.totalPaise > 0 && !submitLate,
      days,
      totals,
      submittedTotals: record?.submittedAt && status !== 'DRAFT' ? { taPaise: record.taPaise, daPaise: record.daPaise, otherPaise: record.otherPaise, totalPaise: record.taPaise + record.daPaise + record.otherPaise } : null,
      paidPaise: rows.filter((r) => r.paymentStatus === 'PAID').reduce((a, r) => a + r.amountPaise, 0),
      deadlines: { submitBy: submitBy.toISOString(), approveBy: approveBy.toISOString() },
      exceptions: { submitUntil: submitGrant?.expiresAt.toISOString() ?? null, approveUntil: approveGrant?.expiresAt.toISOString() ?? null },
      submitLate,
    };
  }

  /** The statement an approval request points at (its record id is the month's id): what the approver reads. */
  async statementByRecord(actor: Actor, recordId: string): Promise<ExpenseStatementView> {
    const record = await this.months.findById(recordId);
    if (!record) throw AppError.notFound('No such expense statement.');
    return this.statement(actor, record.userId, record.month);
  }

  /** The last `count` months, newest first, each with its totals and whether it was approved — the employee's "previous expenses". */
  async history(actor: Actor, userId: string, count = 12): Promise<ExpenseMonthSummaryView[]> {
    await this.assertCanRead(actor, userId);
    const today = await this.clock.today();
    let [year, m] = today.split('-').map(Number) as [number, number];
    const out: ExpenseMonthSummaryView[] = [];
    for (let i = 0; i < count; i += 1) {
      const month = `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
      const rows = await this.expenses.listForUserRange(userId, monthRange(month));
      if (rows.length > 0) {
        const record = await this.months.find(userId, month);
        const request = record ? await this.approvals.getForRecord(EXPENSE_MONTH_KIND, record.id) : null;
        out.push({ month, status: statusOf(request), ...totalsOf(rows), paidPaise: rows.filter((r) => r.paymentStatus === 'PAID').reduce((a, r) => a + r.amountPaise, 0) });
      }
      [year, m] = m === 1 ? [year - 1, 12] : [year, m - 1];
    }
    return out;
  }

  /** Throws unless the employee's month is still theirs to change (not sent for approval, or sent back). */
  async assertEditable(userId: string, month: string): Promise<void> {
    const record = await this.months.find(userId, month);
    const request = record ? await this.approvals.getForRecord(EXPENSE_MONTH_KIND, record.id) : null;
    const status = statusOf(request);
    if (status !== 'DRAFT' && status !== 'REJECTED') throw AppError.conflict('This month has been sent for approval, so it can no longer be changed.', { code: 'EXPENSE_MONTH_LOCKED' });
  }

  private async assertDay(date: string): Promise<void> {
    if (date > (await this.clock.today())) throw AppError.badRequest('An expense cannot be dated in the future.', { field: 'reportDate' });
    await assertFinancialYearOpen(this.config, date, 'This expense');
  }

  async addOther(userId: string, input: { reportDate: string; amountPaise: Paise; remarks: string | null }, now: Date = new Date()): Promise<Expense> {
    await this.assertDay(input.reportDate);
    await this.assertEditable(userId, input.reportDate.slice(0, 7));
    // A single insert is atomic already, so it runs outside any transaction.
    return this.expenses.create(
      { dcrId: null, userId, reportDate: input.reportDate, routeId: null, type: 'OTHER', source: 'MANUAL', amountPaise: input.amountPaise, remarks: input.remarks, paymentStatus: 'UNPAID', accepted: false, monthApproved: false, distanceFlag: false, paidBy: null, paidAt: null, clientId: null, recordedAt: now },
      undefined as never,
    );
  }

  async updateOther(userId: string, id: string, input: { reportDate: string; amountPaise: Paise; remarks: string | null }): Promise<void> {
    const current = await this.expenses.findOtherById(id, userId);
    if (!current) throw AppError.notFound('No such expense.');
    await this.assertDay(input.reportDate);
    await this.assertEditable(userId, current.reportDate.slice(0, 7));
    if (input.reportDate.slice(0, 7) !== current.reportDate.slice(0, 7)) await this.assertEditable(userId, input.reportDate.slice(0, 7));
    if (!(await this.expenses.updateOther(id, userId, input))) throw AppError.conflict('This expense can no longer be changed.');
  }

  async deleteOther(userId: string, id: string): Promise<void> {
    const current = await this.expenses.findOtherById(id, userId);
    if (!current) throw AppError.notFound('No such expense.');
    await this.assertEditable(userId, current.reportDate.slice(0, 7));
    if (!(await this.expenses.deleteOther(id, userId))) throw AppError.conflict('This expense can no longer be removed.');
    // The row is gone, so its proof goes too; a file that cannot be removed now is logged, not allowed to undo the delete.
    await Promise.all(current.attachments.map((a) => this.storage.remove(a.publicId).catch((err: unknown) => logger.error({ err, publicId: a.publicId }, 'could not remove a deleted expense’s proof file'))));
  }

  /** Sends the finished month to the manager (Admin if none). Only once the month is over, and only if there is something to claim. */
  async submit(userId: string, month: string, now: Date = new Date()): Promise<ExpenseStatementView> {
    parseCalendarMonth(month);
    if (!(await this.monthEnded(month))) throw AppError.conflict('A month can be submitted only after it has ended.', { code: 'MONTH_NOT_ENDED' });
    await assertFinancialYearOpen(this.config, monthRange(month).from, `The expenses of ${month}`);
    await this.assertEditable(userId, month);
    const totals = totalsOf(await this.expenses.listForUserRange(userId, monthRange(month)));
    if (totals.totalPaise === 0) throw AppError.badRequest('There is nothing to claim for this month.', { field: 'month' });
    const grant = await this.lateException(userId, month, 'SUBMIT', 'EXPENSE_SUBMIT_LATE', 'The deadline to send this month’s expenses has passed. Ask your manager or Admin to allow it.');
    await this.transactions.run(async (ctx) => {
      if (grant && !(await this.grants.consume(grant.id, this.deadlines.now(), ctx))) throw AppError.conflict('That exception was used or ended just now. Ask for a new one.', { code: 'EXPENSE_SUBMIT_LATE' });
      const record = await this.months.markSubmitted(userId, month, totals, now, ctx);
      await this.approvals.submit({ kind: EXPENSE_MONTH_KIND, recordId: record.id, submitterId: userId }, ctx);
    });
    return this.statement({ id: userId, role: 'FIELD' }, userId, month);
  }
}
