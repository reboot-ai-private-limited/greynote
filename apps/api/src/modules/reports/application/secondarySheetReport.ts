import { AppError } from '@/shared/errors/AppError.js';
import { readBusinessDay, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, leaveYearRange, parseMonthName } from '@/shared/time/businessTime.js';
import { yearMonths } from '../domain/salesFigures.js';
import { fyLabel, monthlyUnits, previousYearMonths, sumRows, type SecondarySheetModel, type SheetRow } from '../domain/secondarySheet.js';
import type { DesignationLevelsPort, FieldRosterPort, IdentityPort, MarketingPort, MasterPort } from '../domain/ports.js';
import { MrRollup } from './mrRollup.js';
import type { MrStockFigures } from './mrStockFigures.js';

export interface SecondarySheetInput {
  actor: { id: string; role: string };
  /** Whose sheet. */
  userId: string;
  /** The year the financial year starts in; left out, the financial year that holds today. */
  year?: number | undefined;
}

/**
 * The data of one employee's Secondary Sales sheet for a financial year (decision-log 2026-11-18): their monthly product targets (units) and **approved**
 * secondary (units). An MR's sheet is their own figures; a manager's is the sum of the MRs below them. The office reads anyone's, an employee their own,
 * a manager their downline's. Reads only.
 */
export class SecondarySheetReport {
  constructor(
    private readonly marketing: MarketingPort,
    private readonly master: MasterPort,
    private readonly identity: IdentityPort & FieldRosterPort & DesignationLevelsPort,
    private readonly config: ConfigReader,
    private readonly achievement: MrStockFigures,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.rollup = new MrRollup(identity);
  }

  private readonly rollup: MrRollup;

  async read(input: SecondarySheetInput): Promise<SecondarySheetModel> {
    await this.assertMayRead(input.actor, input.userId);
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const year = input.year ?? (await this.currentYear(startMonth));
    const range = leaveYearRange(year, startMonth);
    const months = yearMonths(range.from);
    const before = previousYearMonths(months);

    const [who] = await this.identity.listFieldEmployees([input.userId]);
    const [summary] = who ? [] : await this.identity.getUserSummaries([input.userId]);
    if (!who && !summary) throw AppError.notFound('No such employee.');
    const name = who?.name ?? summary!.name;
    const code = who?.employeeCode ?? summary!.employeeCode;

    // An MR is their own figures; a manager is the sum of every MR below them (possibly none yet).
    const memberIds = (await this.rollup.scopes([input.userId])).get(input.userId) ?? [];
    const isManager = memberIds[0] !== input.userId;

    const [lines, previous, shares] = await Promise.all([
      this.achievement.lines(memberIds, months[0]!, months[11]!),
      this.achievement.lines(memberIds, before[0]!, before[11]!),
      memberIds.length ? this.marketing.listTargetShares(memberIds, months[0]!, months[11]!) : Promise.resolve([]),
    ]);
    const productIds = [...new Set([...lines.map((l) => l.productId), ...previous.map((l) => l.productId), ...shares.flatMap((t) => (t.productId ? [t.productId] : []))])];
    const names = productIds.length ? await this.master.listNames({ productIds }) : { products: [] };
    const product = new Map(names.products.map((p) => [p.id, p]));

    // userId -> productId -> the row being filled in.
    const byUser = new Map<string, Map<string, SheetRow>>();
    const rowOf = (userId: string, productId: string): SheetRow => {
      const mine = byUser.get(userId) ?? new Map<string, SheetRow>();
      byUser.set(userId, mine);
      let row = mine.get(productId);
      if (!row) {
        const p = product.get(productId);
        row = { productId, name: p?.name ?? '(removed)', sku: p?.sku ?? '', nsrPaise: p?.ptsPaise ?? null, tgt: months.map(() => 0), sec: months.map(() => 0), prevSec: null };
        mine.set(productId, row);
      }
      return row;
    };
    for (const l of lines) {
      const i = months.indexOf(l.month);
      if (i >= 0) rowOf(l.userId, l.productId).sec[i]! += l.issuedQty;
    }
    for (const l of previous) {
      const row = rowOf(l.userId, l.productId);
      row.prevSec = (row.prevSec ?? 0) + l.issuedQty;
    }
    for (const t of shares) {
      if (!t.productId) continue; // a target for all products is in rupees, not units
      const units = monthlyUnits(t, months);
      const row = rowOf(t.userId, t.productId);
      row.tgt = row.tgt.map((v, i) => v + units[i]!);
    }
    // Every product the person has a target for or sold, so what they sold outside their targeted products is in the total too.
    const used = (r: SheetRow) => r.tgt.some((v) => v !== 0) || r.sec.some((v) => v !== 0) || (r.prevSec ?? 0) !== 0;
    const rowsOf = (id: string) => [...(byUser.get(id)?.values() ?? [])].filter(used);
    const rows = sumRows(memberIds.map(rowsOf));

    return {
      year,
      startMonth,
      label: fyLabel(year, startMonth),
      months,
      person: { id: input.userId, name, code, designation: who?.designation ?? null, kind: isManager ? 'TEAM' : 'MR', members: isManager ? memberIds.length : 1, rows },
    };
  }

  private async currentYear(startMonth: number): Promise<number> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const today = businessDate(this.now(), timeZone, dayStart);
    const y = Number(today.slice(0, 4));
    return Number(today.slice(5, 7)) >= startMonth ? y : y - 1;
  }

  private async assertMayRead(actor: { id: string; role: string }, userId: string): Promise<void> {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT' || actor.role === 'HR' || actor.id === userId) return;
    if (actor.role === 'FIELD' && (await this.identity.getDownline(actor.id)).some((u) => u.id === userId)) return;
    throw AppError.forbidden('You can only download your own sheet and your team\'s.');
  }
}
