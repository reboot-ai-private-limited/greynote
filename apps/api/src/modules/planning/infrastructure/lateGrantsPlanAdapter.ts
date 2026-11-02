import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LateGrantsPublicContract } from '@/modules/lateGrants/lateGrants.public.js';
import type { LateSubmitGrant } from '../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantFilter, LateSubmitGrantRepositoryPort } from '../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../domain/plan.js';

type Unified = NonNullable<Awaited<ReturnType<LateGrantsPublicContract['grants']['findById']>>>;

/** Planning's `planKey` is the unified grant's `periodKey`; everything else is the same shape. */
const toPlanGrant = (g: Unified): LateSubmitGrant => {
  if (g.kind !== 'DAILY_PLAN' && g.kind !== 'MONTHLY_PLAN') throw new RangeError(`Not a plan grant: ${g.kind}`);
  const { periodKey, kind, id, userId, reason, grantedBy, grantedByRole, grantedAt, expiresAt, status, usedAt, revokedAt, revokedBy } = g;
  return { id, userId, kind, planKey: periodKey, reason, grantedBy, grantedByRole, grantedAt, expiresAt, status, usedAt, revokedAt, revokedBy };
};
const isPlan = (g: Unified): boolean => g.kind === 'DAILY_PLAN' || g.kind === 'MONTHLY_PLAN';

/**
 * Plans' late-submission exceptions, kept in the unified Late Grants store. A period Payroll or Expenses has settled counts as having
 * no usable exception — and can't be granted or spent — so a plan can't change under a salary run or expense month already paid.
 */
export class LateGrantsPlanAdapter implements LateSubmitGrantRepositoryPort {
  constructor(private readonly late: LateGrantsPublicContract) {}

  async findById(id: string): Promise<LateSubmitGrant | null> {
    const g = await this.late.grants.findById(id);
    return g && isPlan(g) ? toPlanGrant(g) : null;
  }

  async findUsable(userId: string, kind: PlanKind, planKey: string, now: Date): Promise<LateSubmitGrant | null> {
    const g = await this.late.grants.findUsable(userId, kind, planKey, now);
    if (!g || (await this.late.locks.reason(userId, kind, planKey))) return null;
    return toPlanGrant(g);
  }

  async create(input: Omit<LateSubmitGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date): Promise<LateSubmitGrant | null> {
    await this.late.locks.assertOpen(input.userId, input.kind, input.planKey);
    const { planKey, ...rest } = input;
    const g = await this.late.grants.create({ ...rest, periodKey: planKey }, now);
    return g ? toPlanGrant(g) : null;
  }

  async consume(id: string, now: Date, ctx: TransactionContext): Promise<boolean> {
    const g = await this.late.grants.findById(id);
    if (!g) return false;
    await this.late.locks.assertOpen(g.userId, g.kind, g.periodKey);
    return this.late.grants.consume(id, now, null, ctx);
  }

  async revoke(id: string, revokedBy: string, now: Date): Promise<LateSubmitGrant | null> {
    const g = await this.late.grants.revoke(id, revokedBy, now);
    return g ? toPlanGrant(g) : null;
  }

  async list(filter: LateSubmitGrantFilter, page: { page: number; pageSize: number }): Promise<{ items: LateSubmitGrant[]; total: number }> {
    const { items, total } = await this.late.grants.list({ ...(filter.userIds && { userIds: filter.userIds }), kinds: filter.kind ? [filter.kind] : ['DAILY_PLAN', 'MONTHLY_PLAN'] }, page);
    return { items: items.map(toPlanGrant), total };
  }
}
