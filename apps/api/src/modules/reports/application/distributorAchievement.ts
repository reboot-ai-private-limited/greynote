import { monthRange } from '@/shared/time/businessTime.js';
import type { EntryRow } from '../domain/employeeFigures.js';
import { buildStatement } from '../domain/salesFigures.js';
import type { MasterPort, SalesPort, StatementsPort } from '../domain/ports.js';
import { toCounts, toStatements } from './salesReport.js';

/** `YYYY-MM` from `from` to `to`, both inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y = 0, m = 1] = from.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= to) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * An employee's achievement is what their distributors sold on (decision-log 2026-10-14): for each product and month, the secondary of every
 * distributor handed to the employee, summed. A distributor's secondary is the one the Sales report shows (opening + units delivered, free ones
 * included, − closing, from Admin's statement or the field counts); a month nobody counted or stated adds nothing, and a negative one is a counting
 * error and is left out. A distributor handed to several employees counts in full for each. The rows are shaped like the employee's own entries, so
 * `secondaryOf` values them at PTS unchanged.
 */
export class DistributorAchievement {
  constructor(
    private readonly sales: Pick<SalesPort, 'sumDistributorOrders' | 'listStockRange'> & StatementsPort,
    private readonly master: Pick<MasterPort, 'listDistributorAssignees'>,
  ) {}

  async entries(userIds: readonly string[], fromMonth: string, toMonth: string): Promise<EntryRow[]> {
    if (userIds.length === 0) return [];
    const wanted = new Set(userIds);
    const owners = new Map<string, string[]>();
    for (const d of await this.master.listDistributorAssignees()) {
      const mine = d.assignedUserIds.filter((u) => wanted.has(u));
      if (mine.length > 0) owners.set(d.id, mine);
    }
    if (owners.size === 0) return [];
    const [orderSums, stockRows, statementRows] = await Promise.all([
      this.sales.sumDistributorOrders({ from: monthRange(fromMonth).from, to: monthRange(toMonth).to }),
      this.sales.listStockRange({ fromMonth, toMonth, outletType: 'DISTRIBUTOR' }),
      this.sales.listStatements({ fromMonth, toMonth }),
    ]);
    const kept = <T extends { distributorId: string }>(rows: readonly T[]): T[] => rows.filter((r) => owners.has(r.distributorId));
    const sums = kept(orderSums);
    const stock = kept(toCounts(stockRows));
    const statements = kept(toStatements(statementRows));
    const out: EntryRow[] = [];
    for (const month of monthsBetween(fromMonth, toMonth)) {
      for (const row of buildStatement({ month, orderSums: sums, stock, statements, pts: new Map() })) {
        if (row.secondaryQty === null || row.secondaryQty < 0) continue;
        for (const userId of owners.get(row.distributorId) ?? []) out.push({ userId, productId: row.productId, month, secondaryQty: row.secondaryQty, adjustmentQty: 0 });
      }
    }
    return out;
  }
}
