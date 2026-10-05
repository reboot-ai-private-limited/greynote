import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import { addDays } from '@/shared/time/businessTime.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import { availableDays } from '../domain/leaveBalance.entity.js';
import type { LeaveBalanceRepositoryPort } from '../domain/leaveBalance.repository.port.js';
import { computeLeaveDays, leavesOverlap, type Leave, type LeaveHalf } from '../domain/leave.entity.js';
import type { LeaveBody, LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';
import type { HolidayCalendar } from './holidayCalendar.js';
import type { HrCalendar } from './hrCalendar.js';
import type { LeaveBalances } from './leaveBalances.js';
import type { LeaveView, LeaveViews } from './leaveViews.js';

export interface LeaveInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  half: LeaveHalf | null;
  reason: string;
}

/** A leave that's still in play blocks another over the same dates; a rejected or withdrawn one doesn't. */
const CLOSED = new Set(['REJECTED', 'WITHDRAWN']);

/**
 * Requesting leave, and editing a returned one (LLD hr.md). Creating submits — there are no
 * drafts. The Leave, its balance reservation and its approval request are written in one
 * transaction, so a leave never exists without its request and a reservation never outlives a
 * failed submit. A blocked employee can still request leave (PRD §7.5).
 */
export class LeaveRequests {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly types: LeaveTypeRepositoryPort,
    private readonly balanceRepo: LeaveBalanceRepositoryPort,
    private readonly balances: LeaveBalances,
    private readonly calendar: HrCalendar,
    private readonly holidays: HolidayCalendar,
    private readonly approvals: ApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly views: LeaveViews,
  ) {}

  async request(userId: string, input: LeaveInput): Promise<LeaveView> {
    const body = await this.validate(userId, input, null);
    const leave = await this.transactions.run(async (ctx) => {
      const created = await this.leaves.create(userId, body, ctx);
      await this.reserve(userId, body, ctx);
      await this.approvals.submit({ kind: 'LEAVE', recordId: created.id, submitterId: userId }, ctx);
      return created;
    });
    return this.views.one(leave);
  }

  /** Only after a rejection, a withdrawal or an Admin reopen — and it resubmits. */
  async edit(userId: string, leaveId: string, input: LeaveInput): Promise<LeaveView> {
    const existing = await this.leaves.findById(leaveId);
    if (!existing || existing.userId !== userId) throw AppError.notFound('No such leave.');
    const request = await this.approvals.getForRecord('LEAVE', existing.id);
    if (request && !isEditableBySubmitter(request.status)) {
      throw AppError.conflict(
        request.status === 'APPROVED'
          ? 'This leave is approved and can’t be changed. Ask Admin to reopen it.'
          : 'This leave is waiting for approval and can’t be changed. Withdraw it first.',
      );
    }
    const body = await this.validate(userId, input, existing);
    const leave = await this.transactions.run(async (ctx) => {
      const replaced = await this.leaves.replace(existing.id, existing.revision, body, ctx);
      if (!replaced) throw AppError.conflict('This leave changed while you were editing it. Reload it and try again.');
      await this.reserve(userId, body, ctx);
      await this.approvals.submit({ kind: 'LEAVE', recordId: existing.id, submitterId: userId }, ctx);
      return replaced;
    });
    return this.views.one(leave);
  }

  private async reserve(userId: string, body: LeaveBody, ctx: unknown): Promise<void> {
    if (!body.isPaid) return;
    const key = { userId, leaveTypeId: body.leaveTypeId, year: body.year };
    if (!(await this.balanceRepo.reserve(key, body.daysCount, ctx))) {
      throw AppError.conflict('Not enough leave left for this — another request may have just used it.', { field: 'leaveTypeId' });
    }
  }

  private async validate(userId: string, input: LeaveInput, editing: Leave | null): Promise<LeaveBody> {
    const type = await this.types.findById(input.leaveTypeId);
    if (!type) throw AppError.badRequest('No such leave type.', { field: 'leaveTypeId' });
    if (!type.active) throw AppError.badRequest('This leave type can’t be requested any more.', { field: 'leaveTypeId' });
    if (input.startDate > input.endDate) throw AppError.badRequest('The leave ends before it starts.', { field: 'endDate' });
    // Half-day leave was removed (2026-10-05); old records keep theirs, a new request never has one.
    if (input.half) throw AppError.badRequest('Half-day leave is not available. Request whole days.', { field: 'half' });

    // When (sign-off F11, F15): not further back than the limit, inside the current leave year
    // or the next, and not across a leave-year boundary.
    const [today, backdate, weeklyOff] = await Promise.all([this.calendar.today(), this.calendar.backdateDays(), this.calendar.weeklyOff()]);
    if (input.startDate < addDays(today, -backdate)) {
      throw AppError.badRequest(`Leave can start at most ${backdate} days back.`, { field: 'startDate' });
    }
    const [thisYear, year, endYear] = await Promise.all([
      this.calendar.leaveYearOf(today),
      this.calendar.leaveYearOf(input.startDate),
      this.calendar.leaveYearOf(input.endDate),
    ]);
    if (year !== endYear) throw AppError.badRequest('A leave can’t cross into the next leave year — split it in two.', { field: 'endDate' });
    if (year < thisYear) throw AppError.badRequest('That leave year is closed.', { field: 'startDate' });
    if (year > thisYear + 1) throw AppError.badRequest('That’s too far ahead.', { field: 'startDate' });

    // How many days it counts (F12, F14).
    const days = computeLeaveDays(input.startDate, input.endDate, input.half, weeklyOff, await this.holidays.datesFor(userId, input.startDate, input.endDate));
    const daysCount = days.reduce((sum, d) => sum + d.portion, 0);
    if (daysCount === 0) throw AppError.badRequest('These dates are all days off or holidays.', { field: 'startDate' });

    // Not over another leave that's still in play.
    for (const other of await this.leaves.listOverlapping(userId, input.startDate, input.endDate)) {
      if (other.id === editing?.id || !leavesOverlap(other, input)) continue;
      const status = (await this.approvals.getForRecord('LEAVE', other.id))?.status;
      if (!status || !CLOSED.has(status)) {
        throw AppError.conflict('You already have leave on some of these dates.', { field: 'startDate', leaveId: other.id });
      }
    }

    // Enough balance (F16) — the friendly check; the reservation in the transaction is the real one.
    if (type.isPaid) {
      const balance = (await this.balances.ensureSeeded(userId, year)).find((b) => b.leaveTypeId === type.id);
      if (!balance) throw AppError.badRequest('You have no Pay Band yet, so no paid leave. Ask HR.', { field: 'leaveTypeId' });
      if (availableDays(balance) < daysCount) {
        throw AppError.conflict(`Only ${availableDays(balance)} day(s) of ${type.name} left; this needs ${daysCount}.`, {
          field: 'leaveTypeId',
          available: availableDays(balance),
          needed: daysCount,
        });
      }
    }

    return {
      leaveTypeId: type.id,
      isPaid: type.isPaid,
      year,
      startDate: input.startDate,
      endDate: input.endDate,
      half: input.half,
      reason: input.reason,
      days,
      daysCount,
    };
  }
}
