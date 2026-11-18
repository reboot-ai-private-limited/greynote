import { AppError } from '@/shared/errors/AppError.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { leaveYearRange, parseMonthName } from '@/shared/time/businessTime.js';
import { yearMonths } from '../domain/salesFigures.js';
import { fyLabel, monthlyUnits, previousYearMonths, sumRows, type SecondarySheetModel, type SheetPerson, type SheetRow } from '../domain/secondarySheet.js';
import type { DesignationLevelsPort, FieldRosterPort, IdentityPort, MarketingPort, MasterPort } from '../domain/ports.js';
import { MR_LEVEL, MrRollup } from './mrRollup.js';
import type { MrStockFigures } from './mrStockFigures.js';

/** A workbook is a sheet per person; this keeps one file a size a phone can open. */
export const MAX_PEOPLE = 400;

export interface SecondarySheetInput {
  actor: { id: string; role: string };
  /** The year the financial year starts in. */
  year: number;
  /** A manager's team; left out, a manager gets their own and Admin gets the whole company. */
  managerId?: string | undefined;
}

type Employee = { id: string; employeeCode: string; name: string; designation: string | null };

/**
 * The data of the Secondary Sales sheet for a financial year (decision-log 2026-11-18): every MR's monthly targets (units) and **approved** secondary
 * (units), product by product, and a roll-up for every manager that is the sum of the MRs below them. Admin, Accountant and HR may ask for the whole
 * company or one manager's team; a manager only for their own downline. Reads only.
 */
export class SecondarySheetReport {
  constructor(
    private readonly marketing: MarketingPort,
    private readonly master: MasterPort,
    private readonly identity: IdentityPort & FieldRosterPort & DesignationLevelsPort,
    private readonly config: ConfigReader,
    private readonly achievement: MrStockFigures,
  ) {
    this.rollup = new MrRollup(identity);
  }

  private readonly rollup: MrRollup;

  async read(input: SecondarySheetInput): Promise<SecondarySheetModel> {
    const office = input.actor.role === 'ADMIN' || input.actor.role === 'ACCOUNTANT' || input.actor.role === 'HR';
    if (!office && input.actor.role !== 'FIELD') throw AppError.forbidden('Only a manager or the office can download this.');

    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const range = leaveYearRange(input.year, startMonth);
    const months = yearMonths(range.from);
    const before = previousYearMonths(months);

    // Who is in the file: a root (a manager, or the whole company for the office) and everyone below it.
    const rootId = input.managerId ?? (office ? undefined : input.actor.id);
    let scope: Employee[];
    let scopeName = 'Whole company';
    if (rootId === undefined) scope = await this.identity.listFieldEmployees();
    else {
      if (!office) {
        const mine = rootId === input.actor.id || (await this.identity.getDownline(input.actor.id)).some((u) => u.id === rootId);
        if (!mine) throw AppError.forbidden('You can only download your own team.');
      }
      const below = (await this.identity.getDownline(rootId)).map((d) => d.id);
      if (!office && below.length === 0) throw AppError.forbidden('Only a manager with a team can download this.');
      scope = await this.identity.listFieldEmployees([rootId, ...below]);
      scopeName = scope.find((e) => e.id === rootId)?.name ?? 'Team';
    }
    const levelOf = new Map((await this.identity.getDesignationLevels(scope.map((e) => e.id))).map((l) => [l.userId, l.level]));
    const isMr = (id: string) => (levelOf.get(id) ?? MR_LEVEL) === MR_LEVEL;
    const mrs = scope.filter((e) => isMr(e.id)).sort((a, b) => a.name.localeCompare(b.name));
    const managers = scope.filter((e) => !isMr(e.id));
    if (mrs.length + managers.length > MAX_PEOPLE) throw AppError.badRequest(`That is ${mrs.length + managers.length} people; pick one manager's team (the file holds at most ${MAX_PEOPLE}).`);

    const mrIds = mrs.map((m) => m.id);
    const [lines, previous, shares] = await Promise.all([
      this.achievement.lines(mrIds, months[0]!, months[11]!),
      this.achievement.lines(mrIds, before[0]!, before[11]!),
      mrIds.length ? this.marketing.listTargetShares(mrIds, months[0]!, months[11]!) : Promise.resolve([]),
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
    const sortRows = (rows: SheetRow[]) => rows.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }) || a.name.localeCompare(b.name));
    const rowsOf = (id: string) => sortRows([...(byUser.get(id)?.values() ?? [])].filter((r) => r.tgt.some((v) => v !== 0) || r.sec.some((v) => v !== 0) || (r.prevSec ?? 0) !== 0));

    const mrPeople: SheetPerson[] = mrs.map((m) => ({ id: m.id, name: m.name, code: m.employeeCode, designation: m.designation, kind: 'MR', members: 1, rows: rowsOf(m.id) }));
    const mrRows = new Map(mrPeople.map((p) => [p.id, p.rows]));

    // Each manager is the sum of the MRs below them; the highest first.
    const scopes = await this.rollup.scopes(managers.map((m) => m.id));
    const teamPeople: SheetPerson[] = managers
      .map((m): SheetPerson => {
        const below = (scopes.get(m.id) ?? []).filter((id) => mrRows.has(id));
        return { id: m.id, name: m.name, code: m.employeeCode, designation: m.designation, kind: 'TEAM', members: below.length, rows: sumRows(below.map((id) => mrRows.get(id)!)) };
      })
      .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));

    const withApproved = new Set(lines.map((l) => l.userId)).size;
    return { year: input.year, startMonth, label: fyLabel(input.year, startMonth), months, scopeName, people: [...teamPeople, ...mrPeople], mrCount: mrs.length, mrsWithApproved: withApproved };
  }
}
