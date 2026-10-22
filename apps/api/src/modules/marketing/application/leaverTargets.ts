import type { TargetRepositoryPort } from '../domain/marketing.repository.ports.js';
import { targetShare, targetShareQty } from '../domain/targetRange.js';

const nextMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
/** Far enough ahead for any target: they are bounded by the financial year. */
const FAR = '9999-12';

/**
 * A leaving employee's targets that run past the month they leave in (decision-log 2026-10-22). Cutting one keeps its share up to
 * the leaving month (the amount, and units, spread over its months as everywhere else, so a quarter's ₹3 lakh cut after its first month
 * is ₹1 lakh for that month); one that starts after the leaving month is removed. Safe to run again.
 */
export class LeaverTargets {
  constructor(
    private readonly targets: TargetRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private later(userId: string, leavingMonth: string) {
    return this.targets.listOverlapping([userId], nextMonth(leavingMonth), FAR);
  }

  async count(userId: string, lastWorkingDay: string): Promise<number> {
    return (await this.later(userId, lastWorkingDay.slice(0, 7))).length;
  }

  async cut(userId: string, lastWorkingDay: string, actorId: string): Promise<{ cut: number; removed: number }> {
    const leavingMonth = lastWorkingDay.slice(0, 7);
    let cut = 0;
    let removed = 0;
    for (const t of await this.later(userId, leavingMonth)) {
      if (t.month > leavingMonth) {
        if (await this.targets.remove(t.id)) removed++;
        continue;
      }
      const kept = { from: t.month, to: leavingMonth };
      const amount = targetShare(t, kept);
      const qty = targetShareQty(t, kept);
      const key = { userId: t.userId, month: t.month, toMonth: leavingMonth, productId: t.productId, campaignId: t.campaignId };
      const saved = amount > 0 ? await this.targets.update(t.id, key, amount, qty, actorId, this.now()) : null;
      // Another target already ends there (same product): the overlapping part is dropped rather than doubled.
      if (saved === 'clash' || amount === 0) {
        if (await this.targets.remove(t.id)) removed++;
      } else if (saved) cut++;
    }
    return { cut, removed };
  }
}
