import type { MonthlyStock, Outlet, StockLine, StockStatus } from '../../domain/monthlyStock.entity.js';
import type { MonthlyStockRepositoryPort, StockFilter } from '../../domain/monthlyStock.repository.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';

/** In-memory fakes for Sales' use-case tests — no Mongo, no other module's internals. */

// mr1 covers chem1 + dist1, mr2 covers chem2; asm manages both.
export class FakeMaster implements FieldMasterDataPort {
  private active = { status: 'active' as const };
  outlets: Record<string, { chemists: string[]; distributors: string[] }> = { mr1: { chemists: ['chem1'], distributors: ['dist1'] }, mr2: { chemists: ['chem2'], distributors: [] }, asm: { chemists: [], distributors: [] } };
  inactiveProducts = new Set<string>();
  noHsn = new Set<string>();
  /** Per-product PTS / PTR; a product not listed has none, so an order keeps the price it was sent. */
  prices: Record<string, { pts?: number | null; ptr?: number | null }> = {};
  /** Per-product GST %; a product not listed has none (taxed 0%). */
  gst: Record<string, number> = {};
  async getChemist(id: string) {
    return ['chem1', 'chem2'].includes(id) ? { id, name: id, ...this.active } : null;
  }
  openingDues: Record<string, number> = {};
  async getDistributor(id: string) {
    return id === 'dist1' ? { id, name: id, openingDuesPaise: this.openingDues[id] ?? 0, ...this.active } : null;
  }
  async sumOpeningDues() {
    return Object.values(this.openingDues).reduce((n, v) => n + v, 0);
  }
  async listActiveProducts() {
    return ['prod1', 'prod2'].map((id) => ({ id, name: id, sku: id.toUpperCase(), ptsPaise: 1000, ptrPaise: 1200 }));
  }
  async getProduct(id: string) {
    return id.startsWith('prod') ? { id, name: id, sku: id.toUpperCase(), mrpPaise: null, gstPercent: this.gst[id] ?? null, status: this.inactiveProducts.has(id) ? ('inactive' as const) : ('active' as const), ptsPaise: this.prices[id]?.pts ?? null, ptrPaise: this.prices[id]?.ptr ?? null, hsn: this.noHsn.has(id) ? null : '21069099' } : null;
  }
  async canActOnChemist(u: string, id: string) {
    return this.outlets[u]?.chemists.includes(id) ?? false;
  }
  async canActOnDistributor(u: string, id: string) {
    return this.outlets[u]?.distributors.includes(id) ?? false;
  }
  async listOutletsForUser(u: string) {
    const o = this.outlets[u] ?? { chemists: [], distributors: [] };
    return { chemists: o.chemists.map((id) => ({ id, name: id })), distributors: o.distributors.map((id) => ({ id, name: id })) };
  }
}

export class FakeUsers implements UserDirectoryPort {
  private u = (id: string): DirectoryUser => ({ id, name: id, employeeCode: id, role: id === 'admin' ? 'ADMIN' : 'FIELD', status: 'active' });
  async getUserSummaries(ids: string[]) {
    return ids.map(this.u);
  }
  async getDownline(m: string) {
    return m === 'asm' ? [this.u('mr1'), this.u('mr2')] : [];
  }
  async listActiveFieldUserIds() {
    return ['asm', 'mr1', 'mr2'];
  }
}

export const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: 'NONE', MONTHLY_STOCK_DEADLINE_DAY: '5' })[key] ?? '' };

// ── Monthly stock repository ──

const outletKey = (o: Outlet) => `${o.type}:${o.id}`;

export class FakeStock implements MonthlyStockRepositoryPort {
  rows = new Map<string, MonthlyStock>();
  unlocked = new Set<string>();
  async upsertMany(outlet: Outlet, month: string, lines: StockLine[], by: string, at: Date, _ctx?: unknown, status?: StockStatus) {
    for (const l of lines) {
      const key = `${outletKey(outlet)}|${l.productId}|${month}`;
      const was = this.rows.get(key);
      this.rows.set(key, { id: was?.id ?? `${this.rows.size}`, outlet, productId: l.productId, month, openingQty: l.openingQty, closingQty: l.closingQty, recordedBy: by, recordedAt: at, ...(status ? { status } : was?.status ? { status: was.status } : {}) });
    }
  }
  /** A row with no status is older than approval and counts. */
  private counts = (r: MonthlyStock) => (r.status ?? 'APPROVED') === 'APPROVED';
  async listRange(f: { fromMonth: string; toMonth: string; outletType: Outlet['type']; outletId?: string | undefined; productId?: string | undefined }) {
    return [...this.rows.values()].filter((r) => this.counts(r) && r.outlet.type === f.outletType && r.month >= f.fromMonth && r.month <= f.toMonth && (!f.outletId || r.outlet.id === f.outletId) && (!f.productId || r.productId === f.productId));
  }
  async list(f: StockFilter) {
    const scope = f.outlets ? new Set(f.outlets.map(outletKey)) : null;
    return [...this.rows.values()].filter((r) => (!f.month || r.month === f.month) && (!f.productId || r.productId === f.productId) && (!scope || scope.has(outletKey(r.outlet))));
  }
  async outletsWithStock(month: string, outlets: Outlet[]) {
    const have = new Set([...this.rows.values()].filter((r) => r.month === month).map((r) => outletKey(r.outlet)));
    return outlets.filter((o) => have.has(outletKey(o)));
  }
  async listByRecorder(userId: string, month: string) {
    return [...this.rows.values()].filter((r) => r.recordedBy === userId && r.month === month && r.outlet.type === 'DISTRIBUTOR');
  }
  async setStatus(filter: { recordedBy: string; month: string; distributorId?: string }, from: readonly StockStatus[], to: StockStatus, credited?: string[]) {
    let n = 0;
    for (const [key, r] of this.rows) {
      if (r.recordedBy !== filter.recordedBy || r.month !== filter.month || r.outlet.type !== 'DISTRIBUTOR') continue;
      if (filter.distributorId && r.outlet.id !== filter.distributorId) continue;
      if (!from.includes(r.status ?? 'APPROVED')) continue;
      this.rows.set(key, { ...r, status: to, ...(credited && { creditedUserIds: credited }) });
      n++;
    }
    return n;
  }
  async deleteByRecorder(userId: string, month: string) {
    let n = 0;
    for (const [key, r] of this.rows) if (r.recordedBy === userId && r.month === month && r.outlet.type === 'DISTRIBUTOR' && this.rows.delete(key)) n++;
    return n;
  }
  async isUnlocked(month: string) {
    return this.unlocked.has(month);
  }
  async unlock(month: string) {
    this.unlocked.add(month);
  }
}
