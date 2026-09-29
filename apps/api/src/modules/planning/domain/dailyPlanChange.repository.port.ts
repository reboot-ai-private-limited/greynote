import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DailyPlanChange } from './dailyPlanChange.entity.js';

/** A plan already has a change waiting. Thrown from inside a transaction, caught outside it. */
export class OpenChangeExistsError extends Error {
  constructor() {
    super('This plan already has a change waiting');
    this.name = 'OpenChangeExistsError';
  }
}

export interface DailyPlanChangeRepositoryPort {
  findById(id: string): Promise<DailyPlanChange | null>;
  /** Newest first. */
  listForPlan(planId: string): Promise<DailyPlanChange[]>;
  /** How many changes were approved and applied to this plan. */
  countApplied(planId: string): Promise<number>;
  /** Throws `OpenChangeExistsError` if the plan already has an open change. */
  create(input: Omit<DailyPlanChange, 'id' | 'open' | 'applied' | 'createdAt'>, ctx: TransactionContext): Promise<DailyPlanChange>;
  /** Marks it decided; `applied` when it was approved. */
  close(id: string, applied: boolean, ctx: TransactionContext): Promise<void>;
}
