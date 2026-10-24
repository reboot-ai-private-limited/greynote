import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanEntry } from '../domain/monthlyPlan.entity.js';
import { sameDay, type PlanDay } from '../domain/plan.js';
import { dayLabel } from '../domain/offDays.js';

const dayOf = ({ workingType, dayKind, workWith, routeIds, remarks }: MonthlyPlanEntry): PlanDay => ({ workingType, dayKind, workWith, routeIds, remarks });
const byDate = (entries: MonthlyPlanEntry[]) => new Map(entries.map((e) => [e.planDate, e]));

/** What changed between two versions of a month, by date: `from` is null for a day that is new, `to` null for one that is gone. */
export function changedDays(before: MonthlyPlanEntry[], after: MonthlyPlanEntry[]): Array<{ date: string; from: MonthlyPlanEntry | null; to: MonthlyPlanEntry | null }> {
  const a = byDate(before);
  const b = byDate(after);
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .flatMap((date) => {
      const from = a.get(date) ?? null;
      const to = b.get(date) ?? null;
      return from && to && sameDay(dayOf(from), dayOf(to)) ? [] : [{ date, from, to }];
    });
}

/**
 * An approved month can only change after today: today and earlier days stay as they are. A trip that has started may still be
 * shortened or lengthened, as long as every day up to and including today comes out the same — so a trip can't be made to end today,
 * or a stay day today turned into a transit day. (A trip's stay and transit days are rebuilt from its first day's return date, so
 * the check is on the finished days.) Throws a 409 naming the first day that would change.
 */
export function assertOnlyFutureChanged(before: MonthlyPlanEntry[], after: MonthlyPlanEntry[], today: string): void {
  const locked = changedDays(before, after).filter((c) => c.date <= today);
  if (locked.length > 0) {
    const first = locked[0]!;
    throw AppError.conflict(
      `${dayLabel(first.date)} is ${first.date === today ? 'today' : 'in the past'}, so it can’t be changed on an approved plan. Only days after today can.`,
      { reason: 'PLAN_DAY_LOCKED', planDate: first.date },
    );
  }
  // A trip that already started can't be given a new return date from a day that is over, unless it already had one.
  const was = byDate(before);
  for (const e of after) {
    if (e.planDate <= today && e.returnDate && !was.get(e.planDate)?.returnDate) {
      throw AppError.conflict(`${dayLabel(e.planDate)} is ${e.planDate === today ? 'today' : 'in the past'}, so a trip can’t start from it now.`, {
        reason: 'PLAN_DAY_LOCKED',
        planDate: e.planDate,
      });
    }
  }
}

/** What the employee's Daily Plans will do once the month changes, worked out before anything is saved. */
export interface DailySync {
  create: Array<{ date: string; day: PlanDay }>;
  update: Array<{ id: string; revision: number; day: PlanDay }>;
  remove: Array<{ id: string; revision: number }>;
}

/**
 * The Daily Plans that follow the edit. An inherited day nobody has touched (written from the month, not amended, and not waiting or
 * approved) is brought in line, or removed if the day left the plan. A day the employee changed, a manager amended, or that has been
 * submitted is theirs: the whole edit is refused, naming those days, rather than overwriting it.
 */
export async function planDailySync(
  userId: string,
  changes: ReturnType<typeof changedDays>,
  daily: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
): Promise<DailySync> {
  const sync: DailySync = { create: [], update: [], remove: [] };
  const blocked: string[] = [];
  for (const { date, to } of changes) {
    const day = to ? dayOf(to) : null;
    const existing = await daily.findByUserAndDate(userId, date);
    if (!existing) {
      if (day) sync.create.push({ date, day });
      continue;
    }
    if (day && sameDay(existing, day)) continue;
    const request = await approvals.getForRecord('DAILY_PLAN', existing.id);
    const untouched = existing.source === 'MONTHLY' && existing.amendments.length === 0 && (!request || isEditableBySubmitter(request.status));
    if (!untouched) {
      blocked.push(date);
      continue;
    }
    if (day) sync.update.push({ id: existing.id, revision: existing.revision, day });
    else sync.remove.push({ id: existing.id, revision: existing.revision });
  }
  if (blocked.length > 0) {
    throw AppError.conflict(
      `The daily plan for ${blocked.map(dayLabel).join(', ')} was already changed or sent by the employee, so the month can’t be edited around it. Ask the employee to withdraw it, or leave those days as they are.`,
      { reason: 'PLAN_DAY_IN_USE', planDates: blocked },
    );
  }
  return sync;
}

/** Writes what `planDailySync` worked out. Inside the caller's transaction, so the month and its days change together. */
export async function applyDailySync(userId: string, sync: DailySync, daily: DailyPlanRepositoryPort, ctx: TransactionContext): Promise<void> {
  for (const { date, day } of sync.create) await daily.createInherited(userId, date, day, ctx);
  for (const u of sync.update) {
    if (!(await daily.applyChange(u.id, u.revision, u.day, ctx))) throw AppError.conflict('A daily plan changed while the month was being edited. Reload and try again.');
  }
  for (const r of sync.remove) {
    if (!(await daily.deleteById(r.id, r.revision, ctx))) throw AppError.conflict('A daily plan changed while the month was being edited. Reload and try again.');
  }
}
