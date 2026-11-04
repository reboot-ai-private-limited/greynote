import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import { parseBoolean, parsePositiveInt, readBusinessDay, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import { businessDate, endOfBusinessDay } from '@/shared/time/businessTime.js';
import type { LateGrant, LateGrantKind } from '../../domain/lateGrant.entity.js';
import type { LateGrantRepositoryPort } from '../../domain/lateGrant.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';
import { assertPeriodKey, KIND_REGISTRY, monthOfPeriod } from '../kindRegistry.js';
import type { PeriodLocks } from '../periodLocks.js';

export interface GrantLateInput {
  userId: string;
  kind: LateGrantKind;
  periodKey: string;
  reason: string;
  /** When it ends; omitted: the kind's default length from now. */
  expiresAt?: Date | undefined;
}

/**
 * Let one employee do one late thing — send a plan, a month of expenses, a stock count — after its deadline. Admin can grant any kind
 * to anyone; a manager only for their own team and only while the kind's `*_GRANT_BY_MANAGER` setting is on (read on every call).
 * Refused when the period isn't open any more: future, in a closed financial year, or settled downstream (payroll finalized,
 * expenses paid — see `PeriodLocks`), because a late entry there would make calculations already paid out wrong.
 */
export class GrantLateUseCase {
  constructor(
    private readonly grants: LateGrantRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly locks: PeriodLocks,
    private readonly config: ConfigReader,
    private readonly now: () => Date,
  ) {}

  /** What does not depend on the employee: the period is well-formed, started and in an open year, and the end is allowed. Throws 400/409. */
  async validateRequest(input: Omit<GrantLateInput, 'userId'>): Promise<void> {
    assertPeriodKey(input.kind, input.periodKey);
    const now = this.now();
    await this.assertPeriodOpen(input, now);
    await this.expiry(now, input);
  }

  async execute(actor: Actor, input: GrantLateInput): Promise<LateGrant> {
    assertPeriodKey(input.kind, input.periodKey);
    const [employee] = await this.users.getUserSummaries([input.userId]);
    if (!employee || employee.role !== 'FIELD' || employee.status !== 'active') {
      throw AppError.badRequest('No such active field employee.', { field: 'userId' });
    }
    await this.assertMayGrant(actor, input);

    const now = this.now();
    await this.assertPeriodOpen(input, now);
    await this.locks.assertOpen(input.userId, input.kind, input.periodKey);
    const expiresAt = await this.expiry(now, input);

    const grant = await this.grants.create(
      { userId: input.userId, kind: input.kind, periodKey: input.periodKey, reason: input.reason, grantedBy: actor.id, grantedByRole: actor.role, grantedAt: now, expiresAt },
      now,
    );
    if (!grant) throw AppError.conflict('There’s already an open late-submission exception for this.');

    const eventKind = input.kind === 'EXPENSE_SUBMIT' || input.kind === 'EXPENSE_APPROVE' ? 'EXPENSE_MONTH' : input.kind === 'DAILY_PLAN' || input.kind === 'MONTHLY_PLAN' ? input.kind : null;
    if (eventKind) appEvents.emit('submit.exception.granted', { userId: input.userId, kind: eventKind, planKey: input.periodKey, expiresAt, grantedBy: actor.id });
    return grant;
  }

  /** Not a future period, and the financial year it belongs to is open. */
  private async assertPeriodOpen(input: Omit<GrantLateInput, 'userId'>, now: Date): Promise<void> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const today = businessDate(now, timeZone, dayStart);
    const isDay = KIND_REGISTRY[input.kind].period === 'DAY';
    const started = isDay ? input.periodKey <= today : input.periodKey <= today.slice(0, 7);
    if (!started) throw AppError.badRequest('That period hasn’t started yet.', { field: 'periodKey' });
    await assertFinancialYearOpen(this.config, isDay ? input.periodKey : `${monthOfPeriod(input.periodKey)}-01`, 'This period');
  }

  private async expiry(now: Date, input: Omit<GrantLateInput, 'userId'>): Promise<Date> {
    const meta = KIND_REGISTRY[input.kind];
    // A Daily Plan's exception never runs past the end of that plan's own business day.
    let dayEnd: Date | null = null;
    if (meta.endsWithDay) {
      const { timeZone, dayStart } = await readBusinessDay(this.config);
      dayEnd = endOfBusinessDay(input.periodKey, dayStart, timeZone);
      if (dayEnd <= now) throw AppError.badRequest('That day is over, so its plan can’t be submitted late any more.', { field: 'periodKey' });
    }
    const picked = input.expiresAt;
    if (!picked) {
      const hours = await readConfigOr(this.config, meta.config.validHours, parsePositiveInt(8760), meta.fallback.validHours);
      const end = new Date(now.getTime() + hours * 3_600_000);
      return dayEnd && dayEnd < end ? dayEnd : end;
    }
    if (picked <= now) throw AppError.badRequest('The exception must end in the future.', { field: 'expiresAt' });
    if (dayEnd && picked > dayEnd) {
      throw AppError.badRequest(`A daily plan’s exception can’t run past the end of its day (${dayEnd.toISOString()}).`, { field: 'expiresAt' });
    }
    const maxHours = await readConfigOr(this.config, meta.config.maxHours, parsePositiveInt(8760), meta.fallback.maxHours);
    if (picked.getTime() > now.getTime() + maxHours * 3_600_000) {
      throw AppError.badRequest(`The exception can run at most ${maxHours} hours from now.`, { field: 'expiresAt' });
    }
    return picked;
  }

  private async assertMayGrant(actor: Actor, input: GrantLateInput): Promise<void> {
    if (actor.role === 'ADMIN') return;
    const key = KIND_REGISTRY[input.kind].config.byManager;
    const byManager = key ? await readConfigOr(this.config, key, parseBoolean, false) : false;
    if (actor.role !== 'FIELD' || !byManager) throw AppError.forbidden('Only Admin can allow a late submission.');
    const chain = await this.users.getManagerChain(input.userId);
    if (!chain.some((m) => m.id === actor.id)) throw AppError.forbidden('You can only allow a late submission for someone in your team.');
  }
}
