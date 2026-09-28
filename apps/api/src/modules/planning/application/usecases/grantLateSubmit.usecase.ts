import { AppError } from '@/shared/errors/AppError.js';
import { parseCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { LateSubmitGrant } from '../../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantRepositoryPort } from '../../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../planAccess.js';
import { parseBoolean, parsePositiveInt, readConfig } from '@/shared/config/readConfig.js';

export interface GrantLateSubmitInput {
  userId: string;
  kind: PlanKind;
  /** `YYYY-MM-DD` for `DAILY_PLAN`, `YYYY-MM` for `MONTHLY_PLAN`. */
  planKey: string;
  reason: string;
}

/**
 * Let one employee submit one Plan after its deadline (sign-off B8). Admin can grant it to
 * anyone. A manager can grant it to someone below them, and only while
 * `LATE_PLAN_GRANT_BY_MANAGER` is on — read on every call, so switching it off stops managers at
 * once.
 */
export class GrantLateSubmitUseCase {
  constructor(
    private readonly grants: LateSubmitGrantRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigProviderPort,
    private readonly now: () => Date,
  ) {}

  async execute(actor: Actor, input: GrantLateSubmitInput): Promise<LateSubmitGrant> {
    assertPlanKey(input.kind, input.planKey);
    const [employee] = await this.users.getUserSummaries([input.userId]);
    if (!employee || employee.role !== 'FIELD') {
      throw AppError.badRequest('No such field employee.', { field: 'userId' });
    }
    await this.assertMayGrant(actor, input.userId);

    const hours = await readConfig(this.config, PLANNING_CONFIG_KEYS.grantValidHours, parsePositiveInt(24 * 31));
    const now = this.now();
    const grant = await this.grants.create(
      {
        userId: input.userId,
        kind: input.kind,
        planKey: input.planKey,
        reason: input.reason,
        grantedBy: actor.id,
        grantedByRole: actor.role,
        grantedAt: now,
        expiresAt: new Date(now.getTime() + hours * 3_600_000),
      },
      now,
    );
    if (!grant) throw AppError.conflict('There’s already an open late-submission exception for this plan.');
    return grant;
  }

  private async assertMayGrant(actor: Actor, userId: string): Promise<void> {
    if (actor.role === 'ADMIN') return;
    const byManager = await readConfig(this.config, PLANNING_CONFIG_KEYS.grantByManager, parseBoolean);
    if (actor.role !== 'FIELD' || !byManager) {
      throw AppError.forbidden('Only Admin can allow a late submission.');
    }
    const chain = await this.users.getManagerChain(userId);
    if (!chain.some((m) => m.id === actor.id)) {
      throw AppError.forbidden('You can only allow a late submission for someone in your team.');
    }
  }
}

function assertPlanKey(kind: PlanKind, planKey: string): void {
  try {
    if (kind === 'DAILY_PLAN') parseCalendarDate(planKey);
    else parseCalendarMonth(planKey);
  } catch {
    throw AppError.badRequest(
      kind === 'DAILY_PLAN' ? 'A daily plan is named by its date, YYYY-MM-DD.' : 'A monthly plan is named by its month, YYYY-MM.',
      { field: 'planKey' },
    );
  }
}
