import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { TeamDirectoryPort, TeamSalesPort } from '../../domain/ports.js';
import { activeMembers, type TeamLevel } from '../teamScope.js';

export type SecondaryState = 'NOT_ENTERED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TeamStockQuery {
  /** `YYYY-MM`. */
  month: string;
  scope: TeamLevel;
  /** One person, who must be in the downline (403 otherwise). */
  userId?: string | undefined;
  /** Only people who have outlets with no stock count. */
  missingStock?: boolean | undefined;
  secondary?: SecondaryState | undefined;
  page: number;
  pageSize: number;
}

export interface TeamStockRow {
  user: { id: string; employeeCode: string; name: string; depth: number };
  /** Outlets (chemists and distributors on their routes) with no stock count for the month. */
  missingOutlets: Array<{ type: 'CHEMIST' | 'DISTRIBUTOR'; id: string; name: string }>;
  secondary: SecondaryState;
  /** Their month is waiting on the caller: sent by a direct report and not yet decided. Decide it in Approvals. */
  waitingOnYou: boolean;
}

export interface TeamStockResult extends PaginatedResult<TeamStockRow> {
  month: string;
  /** Everyone at the level, not just the filtered rows. */
  tiles: { total: number; withMissingStock: number; secondary: Record<SecondaryState, number> };
}

/**
 * Who on the team has not counted stock and where each person's secondary for a month stands (not entered, draft, sent to the manager,
 * approved, sent back). A report to chase people with, not a block. The secondary itself is decided in Approvals (`SECONDARY_SALES`).
 */
export class TeamStockUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly sales: TeamSalesPort,
  ) {}

  async execute(managerId: string, query: TeamStockQuery): Promise<TeamStockResult> {
    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
    const ids = members.map((m) => m.id);
    const [missing, secondary] = await Promise.all([
      this.sales.listMissingStock(query.month, ids),
      this.sales.listSecondaryStatus(query.month, ids),
    ]);
    const missingOf = new Map(missing.map((m) => [m.userId, m.outlets]));
    const secondaryOf = new Map(secondary.map((s) => [s.userId, s.status]));

    const rows = members.map((m): TeamStockRow => {
      const state = secondaryOf.get(m.id) ?? 'NOT_ENTERED';
      return {
        user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
        missingOutlets: missingOf.get(m.id) ?? [],
        secondary: state,
        waitingOnYou: state === 'PENDING' && m.depth === 1,
      };
    });
    const tiles: TeamStockResult['tiles'] = {
      total: rows.length,
      withMissingStock: 0,
      secondary: { NOT_ENTERED: 0, DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 },
    };
    for (const r of rows) {
      if (r.missingOutlets.length > 0) tiles.withMissingStock += 1;
      tiles.secondary[r.secondary] += 1;
    }

    // People with something to chase first, then nearest, then by name.
    const rank = (r: TeamStockRow) =>
      Number(r.missingOutlets.length > 0) + Number(r.secondary !== 'APPROVED');
    const shown = rows
      .filter(
        (r) =>
          (!query.missingStock || r.missingOutlets.length > 0) &&
          (!query.secondary || r.secondary === query.secondary),
      )
      .sort(
        (a, b) =>
          rank(b) - rank(a) ||
          a.user.depth - b.user.depth ||
          a.user.name.localeCompare(b.user.name),
      );
    const start = (query.page - 1) * query.pageSize;
    return {
      ...buildPaginatedResult(shown.slice(start, start + query.pageSize), shown.length, query),
      month: query.month,
      tiles,
    };
  }
}
