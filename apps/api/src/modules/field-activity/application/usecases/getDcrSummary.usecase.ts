import type { Paise } from '@/shared/money/paise.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, ExpenseRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { DcrStatus } from '../dcrStatus.js';
import type { DcrViews } from '../dcrViews.js';

/** One day's report in a line, for the reports (LLD field-activity.md, *Public contract*). */
export interface DcrSummary {
  dcrId: string;
  userId: string;
  reportDate: string;
  status: DcrStatus;
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  /** What the day claims, `CANCELLED` rows left out. */
  taPaise: Paise;
  daPaise: Paise;
  /** Manual claims: travel, meals, other. */
  otherExpensesPaise: Paise;
  /** How much of all that has been paid. */
  paidPaise: Paise;
}

/** A user's DCRs in a date range (both ends inclusive), newest first, each summarised — a fixed handful of queries however many days. */
export class GetDcrSummaryUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly views: DcrViews,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
    private readonly expenses: ExpenseRepositoryPort,
  ) {}

  async execute(userId: string, range: { from: string; to: string }): Promise<DcrSummary[]> {
    const views = await this.views.many(await this.dcrs.listForUsers([userId], range.from, range.to));
    const ids = views.map((v) => v.id);
    const [dc, cc, fu, money] = await Promise.all([this.doctorCalls.countForDcrs(ids), this.chemistCalls.countForDcrs(ids), this.followups.countForDcrs(ids), this.expenses.totalsForDcrs(ids)]);
    return views.map((v) => {
      const m = money.get(v.id);
      return { dcrId: v.id, userId: v.userId, reportDate: v.reportDate, status: v.status, doctorCalls: dc.get(v.id) ?? 0, chemistCalls: cc.get(v.id) ?? 0, followups: fu.get(v.id) ?? 0, taPaise: m?.taPaise ?? 0, daPaise: m?.daPaise ?? 0, otherExpensesPaise: m?.otherPaise ?? 0, paidPaise: m?.paidPaise ?? 0 };
    });
  }
}
