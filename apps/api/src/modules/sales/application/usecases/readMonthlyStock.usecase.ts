import type { Outlet } from '../../domain/monthlyStock.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from './recordMonthlyStock.usecase.js';

const LIMIT = 2000;
const key = (o: Outlet) => `${o.type}:${o.id}`;

/** The outlets one user counts stock at: their Chemists and Distributors. */
async function outletsOf(master: FieldMasterDataPort, userId: string): Promise<Array<Outlet & { name: string }>> {
  const { chemists, distributors } = await master.listOutletsForUser(userId);
  return [...chemists.map((c) => ({ type: 'CHEMIST' as const, id: c.id, name: c.name })), ...distributors.map((d) => ({ type: 'DISTRIBUTOR' as const, id: d.id, name: d.name }))];
}

/** Counts an MR may see: their own outlets'. A manager also sees their downline's; Admin sees all. */
export class ListMonthlyStockUseCase {
  constructor(
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, filter: { month?: string | undefined; productId?: string | undefined; outlet?: Outlet | undefined }) {
    let scope: Outlet[] | undefined;
    if (actor.role !== 'ADMIN') {
      const people = [actor.id, ...(await this.users.getDownline(actor.id)).map((u) => u.id)];
      const all = new Map<string, Outlet>();
      for (const id of people) for (const o of await outletsOf(this.master, id)) all.set(key(o), { type: o.type, id: o.id });
      scope = [...all.values()];
      if (filter.outlet) scope = scope.filter((o) => key(o) === key(filter.outlet!));
    } else if (filter.outlet) scope = [filter.outlet];
    return this.stock.list({ month: filter.month, productId: filter.productId, outlets: scope }, LIMIT);
  }
}

export interface MissingStockRow {
  userId: string;
  userName: string;
  outlets: Array<Outlet & { name: string }>;
}

/**
 * Who has not counted stock for a month (LLD sales-and-orders.md): each MR in scope with the outlets that have no
 * count at all. A report, not a block — the manager sees their downline's, Admin everyone's.
 */
export class ListMissingStockUseCase {
  constructor(
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, month: string): Promise<MissingStockRow[]> {
    const ids = actor.role === 'ADMIN' ? await this.users.listActiveFieldUserIds() : (await this.users.getDownline(actor.id)).filter((u) => u.role === 'FIELD' && u.status === 'active').map((u) => u.id);
    const names = new Map((await this.users.getUserSummaries(ids)).map((u) => [u.id, u.name]));
    const rows: MissingStockRow[] = [];
    for (const userId of ids) {
      const outlets = await outletsOf(this.master, userId);
      const counted = new Set((await this.stock.outletsWithStock(month, outlets)).map(key));
      const missing = outlets.filter((o) => !counted.has(key(o)));
      if (missing.length > 0) rows.push({ userId, userName: names.get(userId) ?? userId, outlets: missing });
    }
    return rows;
  }
}
