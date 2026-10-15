import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import { parseCalendarMonth, monthRange } from '@/shared/time/businessTime.js';
import { parseBoolean, parsePositiveInt, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import { effectiveExpenseGrantStatus, type ExpenseGrantPhase, type ExpenseMonthGrant } from '../../domain/expenseMonthGrant.entity.js';
import type { ExpenseMonthGrantRepositoryPort } from '../../domain/expenseMonthGrant.repository.port.js';
import type { ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from './readDcrs.usecase.js';

export interface GrantExpenseMonthInput {
  userId: string;
  /** `YYYY-MM` — the month the expenses were incurred in. */
  month: string;
  phase: ExpenseGrantPhase;
  reason: string;
  /** When it ends; omitted: `LATE_EXPENSE_GRANT_VALID_HOURS` from now. */
  expiresAt?: Date | undefined;
}

/** Whether any row of the employee's month has been settled — after that the month is closed to exceptions. */
export async function monthHasPaidRows(expenses: ExpenseRepositoryPort, userId: string, month: string): Promise<boolean> {
  return (await expenses.listForUserRange(userId, monthRange(month))).some((r) => r.paymentStatus === 'PAID');
}

/**
 * Let one employee's month of expenses be sent, or approved, after its deadline. Admin can grant it for anyone; a manager for
 * someone below them, and only while `LATE_EXPENSE_GRANT_BY_MANAGER` is on (read every call). Refused once any row of the month has
 * been paid — the exception has to come before the money does.
 */
export class GrantExpenseMonthUseCase {
  constructor(
    private readonly grants: ExpenseMonthGrantRepositoryPort,
    private readonly expenses: ExpenseRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date,
  ) {}

  async execute(actor: Actor, input: GrantExpenseMonthInput): Promise<ExpenseMonthGrant> {
    try {
      parseCalendarMonth(input.month);
    } catch {
      throw AppError.badRequest('A month of expenses is named by its month, YYYY-MM.', { field: 'month' });
    }
    const [employee] = await this.users.getUserSummaries([input.userId]);
    if (!employee || employee.role !== 'FIELD') throw AppError.badRequest('No such field employee.', { field: 'userId' });
    await this.assertMayGrant(actor, input.userId);
    if (await monthHasPaidRows(this.expenses, input.userId, input.month)) {
      throw AppError.conflict('Part of this month has already been paid, so it can no longer be allowed late.', { code: 'EXPENSE_MONTH_PAID' });
    }
    const now = this.now();
    const grant = await this.grants.create(
      { userId: input.userId, month: input.month, phase: input.phase, reason: input.reason, grantedBy: actor.id, grantedByRole: actor.role, grantedAt: now, expiresAt: await this.expiry(now, input.expiresAt) },
      now,
    );
    if (!grant) throw AppError.conflict('There’s already an open late-expense exception for this month.');
    // Only the submit phase is the employee's; an approve-phase exception is for the approver.
    if (input.phase === 'SUBMIT') appEvents.emit('submit.exception.granted', { userId: input.userId, kind: 'EXPENSE_MONTH', planKey: input.month, expiresAt: grant.expiresAt, grantedBy: actor.id });
    return grant;
  }

  private async expiry(now: Date, picked: Date | undefined): Promise<Date> {
    if (!picked) {
      const hours = await readConfigOr(this.config, 'LATE_EXPENSE_GRANT_VALID_HOURS', parsePositiveInt(744), 24);
      return new Date(now.getTime() + hours * 3_600_000);
    }
    if (picked <= now) throw AppError.badRequest('The exception must end in the future.', { field: 'expiresAt' });
    const maxHours = await readConfigOr(this.config, 'LATE_EXPENSE_GRANT_MAX_HOURS', parsePositiveInt(8760), 168);
    if (picked.getTime() > now.getTime() + maxHours * 3_600_000) throw AppError.badRequest(`The exception can run at most ${maxHours} hours from now.`, { field: 'expiresAt' });
    return picked;
  }

  private async assertMayGrant(actor: Actor, userId: string): Promise<void> {
    if (actor.role === 'ADMIN') return;
    const byManager = await readConfigOr(this.config, 'LATE_EXPENSE_GRANT_BY_MANAGER', parseBoolean, false);
    if (actor.role !== 'FIELD' || !byManager) throw AppError.forbidden('Only Admin can allow late expenses.');
    if (!(await this.users.getManagerChain(userId)).some((m) => m.id === actor.id)) throw AppError.forbidden('You can only allow late expenses for someone in your team.');
  }
}

export class RevokeExpenseMonthGrantUseCase {
  constructor(
    private readonly grants: ExpenseMonthGrantRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date,
  ) {}

  /** The grantor and Admin may revoke; a manager also those they could have granted (their team's). */
  async execute(actor: Actor, id: string): Promise<ExpenseMonthGrant> {
    const grant = await this.grants.findById(id);
    if (!grant) throw AppError.notFound('No such exception.');
    if (actor.role !== 'ADMIN' && grant.grantedBy !== actor.id) {
      if (!(await this.users.getManagerChain(grant.userId)).some((m) => m.id === actor.id)) throw AppError.forbidden();
    }
    const revoked = await this.grants.revoke(id, actor.id, this.now());
    if (!revoked) throw AppError.conflict('That exception was already used, revoked or expired.');
    return revoked;
  }
}

export class ListExpenseMonthGrantsUseCase {
  constructor(
    private readonly grants: ExpenseMonthGrantRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date,
  ) {}

  /** Admin: everyone's. A manager: their own and their team's. */
  async execute(actor: Actor, page: { page: number; pageSize: number }): Promise<{ items: Array<ExpenseMonthGrant & { effectiveStatus: ExpenseMonthGrant['status'] }>; total: number }> {
    const userIds = actor.role === 'ADMIN' ? undefined : [actor.id, ...(await this.users.getDownline(actor.id)).map((u) => u.id)];
    const { items, total } = await this.grants.list(userIds ? { userIds } : {}, page);
    const now = this.now();
    return { items: items.map((g) => ({ ...g, effectiveStatus: effectiveExpenseGrantStatus(g, now) })), total };
  }
}

