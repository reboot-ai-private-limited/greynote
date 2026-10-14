import type { PayrollRunRepositoryPort } from '../../domain/payroll.repository.port.js';

const LIMIT = 5000;

/** What the company paid in salary in one month: runs the Accountant marked paid. No names, no breakup. */
export interface PaidMonthTotal {
  month: string;
  employees: number;
  paidPaise: number;
}

/** Month-by-month total of salary marked paid (the Accountant's view: the total only, never who got what). */
export class PaidTotalsUseCase {
  constructor(private readonly runs: PayrollRunRepositoryPort) {}

  async execute(range: { fromMonth?: string | undefined; toMonth?: string | undefined; month?: string | undefined }): Promise<PaidMonthTotal[]> {
    const runs = await this.runs.list({ ...range, status: 'FINALIZED' }, LIMIT);
    const byMonth = new Map<string, PaidMonthTotal>();
    for (const r of runs) {
      if (!r.paidAt) continue;
      const row = byMonth.get(r.month) ?? { month: r.month, employees: 0, paidPaise: 0 };
      row.employees += 1;
      row.paidPaise += r.netPayablePaise;
      byMonth.set(r.month, row);
    }
    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }
}
