import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import { addDays } from '@/shared/time/businessTime.js';
import type {
  TeamDirectoryPort,
  TeamMasterPort,
  TeamOrder,
  TeamSalesPort,
} from '../../domain/ports.js';
import { mapInChunks } from '../inChunks.js';
import { activeMembers, type TeamLevel } from '../teamScope.js';

/** The longest window one orders read covers. */
export const MAX_ORDER_WINDOW_DAYS = 93;
/** The most orders read for one person in a window; a person with more is flagged `truncated` rather than silently cut. */
const PER_PERSON_LIMIT = 500;

export interface TeamOrdersQuery {
  from: string;
  to: string;
  scope: TeamLevel;
  /** One person, who must be in the downline (403 otherwise). */
  userId?: string | undefined;
  status?: TeamOrder['status'] | undefined;
  outletType?: 'CHEMIST' | 'DISTRIBUTOR' | undefined;
  page: number;
  pageSize: number;
}

export interface TeamOrderRow {
  id: string;
  user: { id: string; employeeCode: string; name: string; depth: number };
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string; name: string };
  orderDate: string;
  status: TeamOrder['status'];
  /** What was ordered. */
  totalAmountPaise: number;
  /** A Done order: what was delivered, free units excluded (the total if no supply was recorded); null otherwise. */
  suppliedAmountPaise: number | null;
  itemCount: number;
  remarks: string | null;
}

export interface TeamOrdersResult extends PaginatedResult<TeamOrderRow> {
  from: string;
  to: string;
  /** Everything the filters matched, not just the page. `amountPaise` counts Placed and Done; Cancelled are left out of it (as in achievement). */
  totals: {
    count: number;
    amountPaise: number;
    byStatus: Record<TeamOrder['status'], { count: number; amountPaise: number }>;
  };
  /** Someone has more orders in the window than were read, so the totals are short. Narrow the window or the person. */
  truncated: boolean;
}

const UNKNOWN = '(removed)';

/**
 * The team's orders in a window, newest first, with outlet names and totals. A chemist order is information only; a distributor order is
 * marked Done or Cancelled by the MR who placed it — a manager reads them and decides nothing here. One order in full is
 * `GET /sales/orders/:id`, which already lets a manager open their downline's.
 */
export class TeamOrdersUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly sales: TeamSalesPort,
    private readonly master: TeamMasterPort,
  ) {}

  async execute(managerId: string, query: TeamOrdersQuery): Promise<TeamOrdersResult> {
    if (query.to < query.from)
      throw AppError.badRequest('The end of the range is before its start.', { field: 'to' });
    if (query.to > addDays(query.from, MAX_ORDER_WINDOW_DAYS - 1))
      throw AppError.badRequest(`Ask for at most ${MAX_ORDER_WINDOW_DAYS} days at a time.`, {
        field: 'to',
      });

    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
    const who = new Map(members.map((m) => [m.id, m]));
    let truncated = false;
    const orders = (
      await mapInChunks(members, async (m) => {
        const found = await this.sales.listOrders({
          from: query.from,
          to: query.to,
          userId: m.id,
          limit: PER_PERSON_LIMIT,
          ...(query.status && { status: query.status }),
        });
        if (found.length >= PER_PERSON_LIMIT) truncated = true;
        return found;
      })
    )
      .flat()
      .filter((o) => !query.outletType || o.outlet.type === query.outletType)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.id.localeCompare(a.id));

    const byStatus = {
      PLACED: { count: 0, amountPaise: 0 },
      DONE: { count: 0, amountPaise: 0 },
      CANCELLED: { count: 0, amountPaise: 0 },
    };
    for (const o of orders) {
      byStatus[o.status].count += 1;
      byStatus[o.status].amountPaise += o.status === 'DONE' ? (o.suppliedAmountPaise ?? o.totalAmountPaise) : o.totalAmountPaise;
    }
    const totals = {
      count: orders.length,
      amountPaise: byStatus.PLACED.amountPaise + byStatus.DONE.amountPaise,
      byStatus,
    };

    const start = (query.page - 1) * query.pageSize;
    const slice = orders.slice(start, start + query.pageSize);
    const names = await this.master.listNames({
      distributorIds: [
        ...new Set(slice.filter((o) => o.outlet.type === 'DISTRIBUTOR').map((o) => o.outlet.id)),
      ],
      chemistIds: [
        ...new Set(slice.filter((o) => o.outlet.type === 'CHEMIST').map((o) => o.outlet.id)),
      ],
    });
    const nameOf = new Map([
      ...names.distributors.map((d) => [`DISTRIBUTOR:${d.id}`, d.name] as const),
      ...names.chemists.map((c) => [`CHEMIST:${c.id}`, c.name] as const),
    ]);

    const items = slice.flatMap((o): TeamOrderRow[] => {
      const m = who.get(o.userId);
      if (!m) return [];
      return [
        {
          id: o.id,
          user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
          outlet: { ...o.outlet, name: nameOf.get(`${o.outlet.type}:${o.outlet.id}`) ?? UNKNOWN },
          orderDate: o.orderDate,
          status: o.status,
          totalAmountPaise: o.totalAmountPaise,
          suppliedAmountPaise: o.status === 'DONE' ? (o.suppliedAmountPaise ?? o.totalAmountPaise) : null,
          itemCount: o.items.length,
          remarks: o.remarks,
        },
      ];
    });
    return {
      ...buildPaginatedResult(items, orders.length, query),
      from: query.from,
      to: query.to,
      totals,
      truncated,
    };
  }
}
