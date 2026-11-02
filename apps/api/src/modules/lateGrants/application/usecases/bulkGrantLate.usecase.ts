import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrant, LateGrantKind } from '../../domain/lateGrant.entity.js';
import type { Actor } from '../actor.js';
import type { GrantLateUseCase } from './grantLate.usecase.js';

export const BULK_GRANT_MAX = 500;

export type SkipCode = 'GRANT_PERIOD_LOCKED' | 'ALREADY_OPEN' | 'NOT_ELIGIBLE' | 'FORBIDDEN';

export interface BulkGrantInput {
  userIds: string[];
  kind: LateGrantKind;
  periodKey: string;
  reason: string;
  expiresAt?: Date | undefined;
}

export interface BulkGrantResult {
  granted: LateGrant[];
  skipped: Array<{ userId: string; code: SkipCode; reason: string }>;
}

/** Why one employee was left out, or `null` when the error is not about that employee (then it is a real fault). */
function skipOf(err: unknown): { code: SkipCode; reason: string } | null {
  if (!(err instanceof AppError)) return null;
  if (err.code === 'GRANT_PERIOD_LOCKED') return { code: 'GRANT_PERIOD_LOCKED', reason: err.message };
  if (err.statusCode === 403) return { code: 'FORBIDDEN', reason: err.message };
  if (err.statusCode === 409 && err.code === 'CONFLICT') return { code: 'ALREADY_OPEN', reason: err.message };
  if (err.statusCode === 400 && (err.publicDetails as { field?: string } | undefined)?.field === 'userId') return { code: 'NOT_ELIGIBLE', reason: err.message };
  return null;
}

/**
 * The same exception for many employees at once. Everything that does not depend on the person (period, financial year, end time) is
 * checked once up front, so a bad request is a 400 and nothing is written. After that each employee goes through exactly the single
 * grant's rules; one who can't be granted — locked period, already holds an open exception, not in the grantor's team, not an active
 * field employee — is reported and the rest still go through. Any other failure is a real fault and stops the batch.
 */
export class BulkGrantLateUseCase {
  constructor(private readonly single: GrantLateUseCase) {}

  async execute(actor: Actor, input: BulkGrantInput): Promise<BulkGrantResult> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) throw AppError.badRequest('Choose at least one employee.', { field: 'userIds' });
    if (userIds.length > BULK_GRANT_MAX) throw AppError.badRequest(`At most ${BULK_GRANT_MAX} employees at a time.`, { field: 'userIds' });
    const { kind, periodKey, reason, expiresAt } = input;
    await this.single.validateRequest({ kind, periodKey, reason, expiresAt });

    const result: BulkGrantResult = { granted: [], skipped: [] };
    for (const userId of userIds) {
      try {
        result.granted.push(await this.single.execute(actor, { userId, kind, periodKey, reason, expiresAt }));
      } catch (err) {
        const skip = skipOf(err);
        if (!skip) throw err;
        result.skipped.push({ userId, ...skip });
      }
    }
    return result;
  }
}
