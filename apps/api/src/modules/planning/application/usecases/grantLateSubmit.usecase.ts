import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import { endOfBusinessDay, parseCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { PLANNING_CONFIG_KEYS, type ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { LateSubmitGrant } from '../../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantRepositoryPort } from '../../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../planAccess.js';
import { parseBoolean, parsePositiveInt, readBusinessDay, readConfig, readConfigOr } from '@/shared/config/readConfig.js';

export interface GrantLateSubmitInput {
  userId: string;
  kind: PlanKind;
  /** `YYYY-MM-DD` for `DAILY_PLAN`, `YYYY-MM` for `MONTHLY_PLAN`. */
  planKey: string;
  reason: string;
  /** When it ends; omitted: `LATE_PLAN_GRANT_VALID_HOURS` from now. */
  expiresAt?: Date | undefined;
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

    const now = this.now();
    const expiresAt = await this.expiry(now, input);
    const grant = await this.grants.create(
      {
        userId: input.userId,
        kind: input.kind,
        planKey: input.planKey,
        reason: input.reason,
        grantedBy: actor.id,
        grantedByRole: actor.role,
        grantedAt: now,
        expiresAt,
      },
      now,
    );
    if (!grant) throw AppError.conflict('There’s already an open late-submission exception for this plan.');
    appEvents.emit('submit.exception.granted', { userId: input.userId, kind: input.kind, planKey: input.planKey, expiresAt, grantedBy: actor.id });
    return grant;
  }

  /**
   * The end the caller picked — in the future and within the longest allowed — or the default length from now. A Daily Plan's
   * exception never runs past the end of that plan's own business day (the next `DAY_START_TIME`).
   */
  private async expiry(now: Date, input: GrantLateSubmitInput): Promise<Date> {
    const dayEnd = input.kind === 'DAILY_PLAN' ? await this.endOfPlanDay(input.planKey) : null;
    if (dayEnd && dayEnd <= now) {
      throw AppError.badRequest('That day is over, so its plan can’t be submitted late any more.', { field: 'planKey' });
    }
    const picked = input.expiresAt;
    if (!picked) {
      const hours = await readConfig(this.config, PLANNING_CONFIG_KEYS.grantValidHours, parsePositiveInt(24 * 31));
      const end = new Date(now.getTime() + hours * 3_600_000);
      return dayEnd && dayEnd < end ? dayEnd : end;
    }
    if (picked <= now) throw AppError.badRequest('The exception must end in the future.', { field: 'expiresAt' });
    if (dayEnd && picked > dayEnd) {
      throw AppError.badRequest(`A daily plan’s exception can’t run past the end of its day (${dayEnd.toISOString()}).`, { field: 'expiresAt' });
    }
    const maxHours = await readConfigOr(this.config, PLANNING_CONFIG_KEYS.grantMaxHours, parsePositiveInt(8760), 744);
    if (picked.getTime() > now.getTime() + maxHours * 3_600_000) {
      throw AppError.badRequest(`The exception can run at most ${maxHours} hours from now.`, { field: 'expiresAt' });
    }
    return picked;
  }

  private async endOfPlanDay(planDate: string): Promise<Date> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    return endOfBusinessDay(planDate, dayStart, timeZone);
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
