import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateGrant, LateGrantKind, LateGrantsPublicContract } from '@/modules/lateGrants/lateGrants.public.js';
import type { ExpenseGrantPhase, ExpenseMonthGrant } from '../domain/expenseMonthGrant.entity.js';
import type { ExpenseMonthGrantFilter, ExpenseMonthGrantRepositoryPort } from '../domain/expenseMonthGrant.repository.port.js';

const KIND_OF: Record<ExpenseGrantPhase, LateGrantKind> = { SUBMIT: 'EXPENSE_SUBMIT', APPROVE: 'EXPENSE_APPROVE' };
const PHASE_OF = (kind: LateGrantKind): ExpenseGrantPhase => (kind === 'EXPENSE_APPROVE' ? 'APPROVE' : 'SUBMIT');
const EXPENSE_KINDS: LateGrantKind[] = ['EXPENSE_SUBMIT', 'EXPENSE_APPROVE'];
const isExpense = (g: LateGrant): boolean => g.kind === 'EXPENSE_SUBMIT' || g.kind === 'EXPENSE_APPROVE';

/** An expense month's `month` and `phase` are the unified grant's `periodKey` and kind; the rest is the same shape. */
const toExpenseGrant = (g: LateGrant): ExpenseMonthGrant => ({
  id: g.id, userId: g.userId, month: g.periodKey, phase: PHASE_OF(g.kind), reason: g.reason, grantedBy: g.grantedBy, grantedByRole: g.grantedByRole,
  grantedAt: g.grantedAt, expiresAt: g.expiresAt, status: g.status, usedAt: g.usedAt, revokedAt: g.revokedAt, revokedBy: g.revokedBy,
});

/**
 * Expense-month exceptions, kept in the unified Late Grants store. A month that is finalized for payout or has a paid row counts as
 * having no usable exception, and can't be granted or spent against.
 */
export class LateGrantsExpenseAdapter implements ExpenseMonthGrantRepositoryPort {
  constructor(private readonly late: LateGrantsPublicContract) {}

  async findById(id: string): Promise<ExpenseMonthGrant | null> {
    const g = await this.late.grants.findById(id);
    return g && isExpense(g) ? toExpenseGrant(g) : null;
  }

  async findUsable(userId: string, month: string, phase: ExpenseGrantPhase, now: Date): Promise<ExpenseMonthGrant | null> {
    const g = await this.late.grants.findUsable(userId, KIND_OF[phase], month, now);
    if (!g || (await this.late.locks.reason(userId, g.kind, month))) return null;
    return toExpenseGrant(g);
  }

  async listUsableForMonth(month: string, now: Date): Promise<ExpenseMonthGrant[]> {
    return (await this.late.grants.listUsable(EXPENSE_KINDS, month, now)).map(toExpenseGrant);
  }

  async create(input: Omit<ExpenseMonthGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date): Promise<ExpenseMonthGrant | null> {
    const kind = KIND_OF[input.phase];
    await this.late.locks.assertOpen(input.userId, kind, input.month);
    const { month, phase: _phase, ...rest } = input;
    void _phase;
    const g = await this.late.grants.create({ ...rest, kind, periodKey: month }, now);
    return g ? toExpenseGrant(g) : null;
  }

  async consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean> {
    const g = await this.late.grants.findById(id);
    if (!g) return false;
    await this.late.locks.assertOpen(g.userId, g.kind, g.periodKey);
    return this.late.grants.consume(id, now, null, ctx);
  }

  async revoke(id: string, revokedBy: string, now: Date): Promise<ExpenseMonthGrant | null> {
    const g = await this.late.grants.revoke(id, revokedBy, now);
    return g ? toExpenseGrant(g) : null;
  }

  async list(filter: ExpenseMonthGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: ExpenseMonthGrant[]; total: number }> {
    const { items, total } = await this.late.grants.list({ ...(filter.userIds && { userIds: filter.userIds }), kinds: EXPENSE_KINDS }, page);
    return { items: items.map(toExpenseGrant), total };
  }
}
