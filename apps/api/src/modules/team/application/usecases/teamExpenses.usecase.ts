import type { TeamDirectoryPort, TeamFieldActivityPort } from '../../domain/ports.js';
import { activeMembers } from '../teamScope.js';

/** Where a month of expenses stands: not sent, with the approver, approved, or sent back. */
export type ExpenseState = 'NOT_SENT' | 'WAITING' | 'APPROVED' | 'SENT_BACK';
const STATE = { DRAFT: 'NOT_SENT', SUBMITTED: 'WAITING', APPROVED: 'APPROVED', REJECTED: 'SENT_BACK' } as const;

export interface TeamExpensesQuery {
  /** `YYYY-MM`. */
  month: string;
  status?: ExpenseState | undefined;
}

export interface TeamExpenseRow {
  user: { id: string; employeeCode: string; name: string; depth: number };
  status: ExpenseState;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  /** Sent by a direct report and not yet decided: decide it in Approvals. */
  waitingOnYou: boolean;
}

/**
 * The team's expenses for a month, one row per person (TA, DA, other, and whether the month was sent, approved or sent back), those not sent first.
 * A report to chase people with and to download; the person's own Expenses tab has the day-by-day detail. Downline only.
 */
export class TeamExpensesUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly fieldActivity: Pick<TeamFieldActivityPort, 'listExpenseMonthSummaries'>,
  ) {}

  async execute(managerId: string, query: TeamExpensesQuery): Promise<{ month: string; total: number; items: TeamExpenseRow[] }> {
    const members = await activeMembers(this.directory, managerId, 'all');
    const sums = new Map((await this.fieldActivity.listExpenseMonthSummaries(members.map((m) => m.id), query.month)).map((s) => [s.userId, s]));
    const rows = members.map((m): TeamExpenseRow => {
      const s = sums.get(m.id);
      const status = STATE[s?.status ?? 'DRAFT'];
      return {
        user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
        status,
        taPaise: s?.taPaise ?? 0,
        daPaise: s?.daPaise ?? 0,
        otherPaise: s?.otherPaise ?? 0,
        totalPaise: s?.totalPaise ?? 0,
        waitingOnYou: status === 'WAITING' && m.depth === 1,
      };
    });
    const rank = (r: TeamExpenseRow) => (r.status === 'NOT_SENT' ? 0 : r.status === 'SENT_BACK' ? 1 : r.status === 'WAITING' ? 2 : 3);
    const items = rows
      .filter((r) => !query.status || r.status === query.status)
      .sort((a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name));
    return { month: query.month, total: items.length, items };
  }
}
