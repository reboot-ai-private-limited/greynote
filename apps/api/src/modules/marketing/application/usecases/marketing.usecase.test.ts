import { beforeEach, describe, expect, it } from 'vitest';
import type { Campaign, Target, TargetKey, Visual } from '../../domain/marketing.entities.js';
import type { CampaignRepositoryPort, TargetRepositoryPort, VisualRepositoryPort, VisualStoragePort } from '../../domain/marketing.repository.ports.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { DirectoryUser, ProductPort, SalesPort, UserDirectoryPort } from '../../domain/ports.js';
import { targetShare } from '../../domain/targetRange.js';
import { DeleteTargetUseCase, GetTargetSummaryUseCase, ListTargetSharesUseCase, SetTargetUseCase, UpdateTargetUseCase } from './targets.usecase.js';
import { CreateCampaignUseCase, CreateVisualUseCase, DeleteVisualUseCase, GetVisualDeleteImpactUseCase, ListCampaignsUseCase, ListVisualsUseCase, ReplaceVisualFileUseCase } from './visualsAndCampaigns.usecase.js';

const k = (t: TargetKey) => `${t.userId}|${t.month}|${t.toMonth}|${t.productId}|${t.campaignId}`;
class FakeTargets implements TargetRepositoryPort {
  rows = new Map<string, Target>();
  async upsert(key: TargetKey, amountPaise: number, qty: number | null, by: string, at: Date) {
    const old = this.rows.get(k(key));
    const row: Target = { id: old?.id ?? `t${this.rows.size + 1}`, ...key, targetAmountPaise: amountPaise, targetQty: qty, createdBy: by, createdAt: old?.createdAt ?? at, updatedAt: at };
    this.rows.set(k(key), row);
    return row;
  }
  async findById(id: string) {
    return [...this.rows.values()].find((t) => t.id === id) ?? null;
  }
  async update(id: string, key: TargetKey, amountPaise: number, qty: number | null, by: string, at: Date) {
    const row = await this.findById(id);
    if (!row) return null;
    const other = this.rows.get(k(key));
    if (other && other.id !== id) return 'clash' as const;
    this.rows.delete(k(row));
    const next: Target = { ...row, ...key, targetAmountPaise: amountPaise, targetQty: qty, createdBy: by, updatedAt: at };
    this.rows.set(k(key), next);
    return next;
  }
  async remove(id: string) {
    const row = await this.findById(id);
    return row ? this.rows.delete(k(row)) : false;
  }
  async listOverlapping(ids: string[], from: string, to: string, scope: { productId?: string | null; campaignId?: string | null } = {}) {
    return [...this.rows.values()].filter((t) => ids.includes(t.userId) && t.month <= to && t.toMonth >= from && (scope.productId === undefined || t.productId === scope.productId) && (scope.campaignId === undefined || t.campaignId === scope.campaignId));
  }
}
const config = { async get(key: string) { return ({ FY_START_MONTH: 'APRIL', BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_CLOSED_YEARS: 'NONE' } as Record<string, string>)[key] ?? ''; } };
const today = () => new Date('2026-10-09T06:00:00Z');

class FakeCampaigns implements CampaignRepositoryPort {
  rows: Campaign[] = [];
  async create(i: Omit<Campaign, 'id'>) {
    const c = { ...i, id: `c${this.rows.length + 1}` };
    this.rows.push(c);
    return c;
  }
  async findById(id: string) {
    return this.rows.find((c) => c.id === id) ?? null;
  }
  async list(f: { status?: string | undefined }) {
    return this.rows.filter((c) => !f.status || c.status === f.status);
  }
  async setStatus(id: string, status: Campaign['status']) {
    const c = this.rows.find((r) => r.id === id);
    if (c) c.status = status;
    return c ?? null;
  }
}
class FakeVisuals implements VisualRepositoryPort {
  rows: Visual[] = [];
  failCreate = false;
  async create(i: Omit<Visual, 'id'>) {
    if (this.failCreate) throw new Error('db down');
    const v = { ...i, id: `v${this.rows.length + 1}` };
    this.rows.push(v);
    return v;
  }
  async findById(id: string) {
    return this.rows.find((v) => v.id === id) ?? null;
  }
  async list(f: { status?: string | undefined; productId?: string | undefined }) {
    return this.rows.filter((v) => (!f.status || v.status === f.status) && (!f.productId || v.productId === f.productId));
  }
  async findByIds(ids: string[]) {
    return this.rows.filter((v) => ids.includes(v.id));
  }
  async setStatus(id: string, status: Visual['status']) {
    const v = this.rows.find((r) => r.id === id);
    if (v) v.status = status;
    return v ?? null;
  }
  async update(id: string, patch: Partial<Pick<Visual, 'title' | 'category' | 'productId' | 'status'>>) {
    const v = this.rows.find((r) => r.id === id);
    if (v) Object.assign(v, Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)));
    return v ?? null;
  }
  failReplace = false;
  async replaceFile(id: string, file: { fileUrl: string; publicId: string; mimeType: string }) {
    if (this.failReplace) throw new Error('db down');
    const v = this.rows.find((r) => r.id === id);
    if (!v) return null;
    const before = { ...v };
    Object.assign(v, file);
    return before;
  }
  async delete(id: string) {
    const i = this.rows.findIndex((r) => r.id === id);
    return i < 0 ? null : (this.rows.splice(i, 1)[0] as Visual);
  }
}
class FakeStorage implements VisualStoragePort {
  files = new Set<string>();
  async upload() {
    const publicId = `f${this.files.size + 1}`;
    this.files.add(publicId);
    return { url: `https://files/${publicId}`, publicId };
  }
  async remove(id: string) {
    this.files.delete(id);
  }
}

// ceo (Admin) · rsm manages asm · asm manages mr1, mr2 · mr3 stands alone
const tree: Record<string, string | null> = { rsm: null, asm: 'rsm', mr1: 'asm', mr2: 'asm', mr3: null };
const user = (id: string, status: DirectoryUser['status'] = 'active'): DirectoryUser => ({ id, name: id, role: id === 'admin' ? 'ADMIN' : 'FIELD', status });
const users: UserDirectoryPort = {
  async findUserSummary(id) {
    return id === 'admin' || id in tree ? user(id, id === 'gone' ? 'inactive' : 'active') : id === 'gone' ? user('gone', 'inactive') : null;
  },
  async getDownline(m) {
    const below = (id: string): string[] => Object.keys(tree).filter((c) => tree[c] === id).flatMap((c) => [c, ...below(c)]);
    return below(m).map((id) => user(id));
  },
  async getDesignationLevels(ids) {
    return ids.filter((id) => id in tree).map((userId) => ({ userId, level: userId === 'rsm' ? 3 : userId === 'asm' ? 2 : 1 }));
  },
};
const products: ProductPort = { async getProduct(id) { return id === 'prod1' ? { id, status: 'active', ptsPaise: 1200 } : id === 'prodOff' ? { id, status: 'inactive', ptsPaise: null } : id === 'prodNoPts' ? { id, status: 'active', ptsPaise: null } : null; } };
const admin = { id: 'admin', role: 'ADMIN' };
const hr = { id: 'hr', role: 'HR' };
const f = (id: string) => ({ id, role: 'FIELD' });

describe('target units and amount', () => {
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof MarketingRefusal ? e.code : 'OTHER'));
  it('units × PTS is the amount; an amount restates as units; no PTS or all products means amount only', async () => {
    const targets = new FakeTargets();
    const set = new SetTargetUseCase(targets, {} as never, products, { findUserSummary: async () => ({ id: 'mr1', status: 'active', role: 'FIELD' }), getDownline: async () => [], getDesignationLevels: async () => [{ userId: 'mr1', level: 1 }] } as never, config, () => new Date('2026-10-12T05:00:00Z'));
    const base = { userId: 'mr1', month: '2026-10', productId: 'prod1', campaignId: null };
    expect(await set.execute(admin, { ...base, targetQty: 50 })).toMatchObject({ targetQty: 50, targetAmountPaise: 60_000 });
    expect(await set.execute(admin, { ...base, targetAmountPaise: 120_000 })).toMatchObject({ targetQty: 100, targetAmountPaise: 120_000 });
    expect(await set.execute(admin, { ...base, productId: null, targetAmountPaise: 5_000 })).toMatchObject({ targetQty: null });
    expect(await code(set.execute(admin, { ...base, productId: 'prodNoPts', targetQty: 5 }))).toBe(MARKETING_CODES.invalidDates);
  });
});

describe('targets', () => {
  let targets: FakeTargets;
  let campaigns: FakeCampaigns;
  let sold: Array<{ userIds: string[]; from: string; to: string; productId?: string | undefined }>;
  let set: SetTargetUseCase;
  let summary: GetTargetSummaryUseCase;
  const general = { month: '2026-10', productId: null, campaignId: null };
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof MarketingRefusal ? e.code : 'OTHER'));

  beforeEach(() => {
    targets = new FakeTargets();
    campaigns = new FakeCampaigns();
    sold = [];
    const sales: SalesPort = { async sumOrderAmount(q) { sold.push(q); return q.userIds.length * 1000; } };
    set = new SetTargetUseCase(targets, campaigns, products, users, config, today);
    summary = new GetTargetSummaryUseCase(targets, campaigns, users, sales);
  });

  it('Admin sets a target for anyone; setting the same key again replaces it, not adds', async () => {
    await set.execute(admin, { userId: 'mr1', ...general, targetAmountPaise: 500_000 });
    await set.execute(admin, { userId: 'mr1', ...general, targetAmountPaise: 700_000 });
    expect(targets.rows.size).toBe(1);
    expect([...targets.rows.values()][0]).toMatchObject({ targetAmountPaise: 700_000, createdBy: 'admin' });
  });

  it('a product-specific and a general target for the same month are different rows', async () => {
    await set.execute(admin, { userId: 'mr1', ...general, targetAmountPaise: 500_000 });
    await set.execute(admin, { userId: 'mr1', ...general, productId: 'prod1', targetAmountPaise: 100_000 });
    expect(targets.rows.size).toBe(2);
  });

  it('Admin and HR set anyone’s (any depth), never a manager’s; a manager, even above the MR, may not set', async () => {
    await set.execute(hr, { userId: 'mr1', ...general, targetAmountPaise: 1 });
    await set.execute(hr, { userId: 'mr3', ...general, targetAmountPaise: 2 }); // outside any one manager's team
    expect(await code(set.execute(hr, { userId: 'asm', ...general, targetAmountPaise: 3 }))).toBe(MARKETING_CODES.invalidDates); // a manager's is the sum of their MRs
    for (const manager of ['asm', 'rsm']) expect(await code(set.execute(f(manager), { userId: 'mr1', ...general, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.notYourTeam);
  });

  describe('editing a target in place', () => {
    const edit = () => new UpdateTargetUseCase(targets, campaigns, products, users, config, today);
    const first = async () => set.execute(admin, { userId: 'mr1', ...general, targetAmountPaise: 500_000 });

    it('changes the months, the product and the amount on the same target, and records who changed it', async () => {
      const t = await first();
      const edited = await edit().execute(hr, t.id, { month: '2026-11', toMonth: '2027-01', productId: 'prod1', targetAmountPaise: 120_000 });
      expect(edited).toMatchObject({ id: t.id, userId: 'mr1', month: '2026-11', toMonth: '2027-01', productId: 'prod1', targetAmountPaise: 120_000, targetQty: 100, createdBy: 'hr' });
      expect(targets.rows.size).toBe(1);
      // Back to all products, as an amount; units only go with a product.
      expect(await edit().execute(admin, t.id, { month: '2026-11', productId: null, targetAmountPaise: 90_000 })).toMatchObject({ productId: null, toMonth: '2026-11', targetQty: null });
    });

    it('takes units for a product target: the amount follows at PTS', async () => {
      const t = await first();
      expect(await edit().execute(admin, t.id, { month: '2026-10', productId: 'prod1', targetQty: 50 })).toMatchObject({ targetQty: 50, targetAmountPaise: 60_000 });
    });

    it('refuses to become another target the employee already has, and leaves both as they were', async () => {
      const t = await first();
      await set.execute(admin, { userId: 'mr1', ...general, productId: 'prod1', targetAmountPaise: 100_000 });
      const err = await edit().execute(admin, t.id, { month: '2026-10', productId: 'prod1', targetAmountPaise: 1 }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: MARKETING_CODES.targetClash, message: 'There is already a target for this product over Oct 2026. Edit that one instead.' });
      expect((err as MarketingRefusal).status).toBe(409);
      expect(targets.rows.size).toBe(2);
      expect((await targets.findById(t.id))!.targetAmountPaise).toBe(500_000);
    });

    it('same rules as setting: the team, the financial year, an active product, an unknown target', async () => {
      const t = await first();
      expect(await code(edit().execute(f('mr1'), t.id, { month: '2026-10', productId: null, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.notYourTeam);
      expect(await code(edit().execute(admin, t.id, { month: '2027-04', productId: null, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.outsideFinancialYear);
      expect(await code(edit().execute(admin, t.id, { month: '2026-10', productId: 'prodOff', targetAmountPaise: 1 }))).toBe(MARKETING_CODES.productNotFound);
      expect(await code(edit().execute(admin, 'nope', { month: '2026-10', productId: null, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.targetNotFound);
    });
  });

  it('an MR without a team cannot set targets, not even their own', async () => {
    expect(await code(set.execute(f('mr1'), { userId: 'mr1', ...general, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.notYourTeam);
  });

  it('refuses an unknown or inactive employee, an inactive product, an unknown campaign', async () => {
    expect(await code(set.execute(admin, { userId: 'nobody', ...general, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.userNotFound);
    expect(await code(set.execute(admin, { userId: 'admin', ...general, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.userNotFound); // not a FIELD employee
    expect(await code(set.execute(admin, { userId: 'mr1', ...general, productId: 'prodOff', targetAmountPaise: 1 }))).toBe(MARKETING_CODES.productNotFound);
    expect(await code(set.execute(admin, { userId: 'mr1', ...general, campaignId: 'nope', targetAmountPaise: 1 }))).toBe(MARKETING_CODES.campaignNotFound);
    expect(targets.rows.size).toBe(0);
  });

  it('a manager’s effective target is the sum of the MRs below; a target set on a manager before is ignored', async () => {
    await targets.upsert({ userId: 'asm', ...general, toMonth: general.month }, 100, null, 'admin', new Date()); // legacy, set before 2026-10-14
    await set.execute(admin, { userId: 'mr1', ...general, targetAmountPaise: 40 }); // mr2 has none
    await set.execute(admin, { userId: 'mr3', ...general, targetAmountPaise: 9999 }); // outside the tree
    const s = await summary.execute(f('asm'), 'asm', general);
    expect(s).toMatchObject({ ownTargetPaise: 0, downlineTargetPaise: 40, downlineCount: 2, effectiveTargetPaise: 40 });
    expect((await summary.execute(f('rsm'), 'rsm', general)).effectiveTargetPaise).toBe(40); // asm's own is not counted again through the tree
  });

  it('achieved is what the user and their whole downline ordered over the month', async () => {
    const s = await summary.execute(f('asm'), 'asm', general);
    expect(sold[0]).toMatchObject({ userIds: ['asm', 'mr1', 'mr2'], from: '2026-10-01', to: '2026-10-31' });
    expect(s.achievedPaise).toBe(3000);
    expect(s.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('a product narrows both sides: its targets and only its order lines', async () => {
    await set.execute(admin, { userId: 'mr1', ...general, targetAmountPaise: 500 });
    await set.execute(admin, { userId: 'mr1', ...general, productId: 'prod1', targetAmountPaise: 70 });
    const s = await summary.execute(f('asm'), 'mr1', { ...general, productId: 'prod1' });
    expect(s.ownTargetPaise).toBe(70);
    expect(sold[0]!.productId).toBe('prod1');
  });

  it('a campaign narrows the orders to its dates inside the month', async () => {
    const c = await new CreateCampaignUseCase(campaigns).execute(admin, { name: 'Diwali', description: '', startDate: '2026-10-10', endDate: '2026-11-05' });
    await summary.execute(admin, 'mr1', { ...general, campaignId: c.id });
    expect(sold[0]).toMatchObject({ from: '2026-10-10', to: '2026-10-31' });
  });

  it('a campaign that does not overlap the month counts nothing, and asks Sales nothing', async () => {
    const c = await new CreateCampaignUseCase(campaigns).execute(admin, { name: 'Old', description: '', startDate: '2026-01-01', endDate: '2026-01-31' });
    const s = await summary.execute(admin, 'mr1', { ...general, campaignId: c.id });
    expect(s.achievedPaise).toBe(0);
    expect(sold).toEqual([]);
  });

  it('who may read: self, the manager above (any depth), Admin — not peers or strangers', async () => {
    await summary.execute(f('mr1'), 'mr1', general);
    await summary.execute(f('rsm'), 'mr1', general);
    await summary.execute(admin, 'mr1', general);
    expect(await code(summary.execute(f('mr2'), 'mr1', general))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(summary.execute(f('mr3'), 'mr1', general))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(summary.execute(admin, 'nobody', general))).toBe(MARKETING_CODES.userNotFound);
  });
});

describe('the financial-year bound', () => {
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof MarketingRefusal ? e.code : 'OTHER'));
  const targets = new FakeTargets();
  const set = new SetTargetUseCase(targets, new FakeCampaigns(), products, users, config, today);
  const general = { productId: null, campaignId: null };

  it('a target is accepted for any month of the current FY (Apr 2026 – Mar 2027) and refused outside it', async () => {
    await set.execute(admin, { userId: 'mr1', month: '2026-04', ...general, targetAmountPaise: 1 });
    await set.execute(admin, { userId: 'mr1', month: '2027-03', ...general, targetAmountPaise: 1 });
    expect(await code(set.execute(admin, { userId: 'mr1', month: '2026-03', ...general, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.outsideFinancialYear);
    expect(await code(set.execute(admin, { userId: 'mr1', month: '2027-04', ...general, targetAmountPaise: 1 }))).toBe(MARKETING_CODES.outsideFinancialYear);
  });
});

describe('targets over a run of months', () => {
  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof MarketingRefusal ? e.code : 'OTHER'));
  let targets: FakeTargets;
  let set: SetTargetUseCase;
  const base = { userId: 'mr1', productId: 'prod1', campaignId: null };
  beforeEach(() => {
    targets = new FakeTargets();
    set = new SetTargetUseCase(targets, new FakeCampaigns(), products, users, config, today);
  });

  it('a target may cover a month, a quarter or the year; a different range is a different row, the same range replaces', async () => {
    await set.execute(admin, { ...base, month: '2026-10', targetAmountPaise: 100 });
    await set.execute(admin, { ...base, month: '2026-10', toMonth: '2026-12', targetAmountPaise: 300 });
    await set.execute(admin, { ...base, month: '2026-04', toMonth: '2027-03', targetAmountPaise: 1200 });
    await set.execute(admin, { ...base, month: '2026-10', toMonth: '2026-12', targetAmountPaise: 330 });
    expect(targets.rows.size).toBe(3);
    expect([...targets.rows.values()].find((t) => t.toMonth === '2026-12')).toMatchObject({ targetAmountPaise: 330 });
  });

  it('refuses a range that ends before it starts or leaves the current financial year', async () => {
    expect(await code(set.execute(admin, { ...base, month: '2026-12', toMonth: '2026-10', targetAmountPaise: 1 }))).toBe(MARKETING_CODES.invalidDates);
    expect(await code(set.execute(admin, { ...base, month: '2027-02', toMonth: '2027-05', targetAmountPaise: 1 }))).toBe(MARKETING_CODES.outsideFinancialYear);
    expect(await code(set.execute(admin, { ...base, month: '2026-02', toMonth: '2026-06', targetAmountPaise: 1 }))).toBe(MARKETING_CODES.outsideFinancialYear);
  });

  it('spreads a target evenly over its months: a window gets its share, the whole range gets all of it', () => {
    const quarter = { month: '2026-10', toMonth: '2026-12', targetAmountPaise: 300_000 };
    expect(targetShare(quarter, { from: '2026-10', to: '2026-10' })).toBe(100_000);
    expect(targetShare(quarter, { from: '2026-11', to: '2027-01' })).toBe(200_000);
    expect(targetShare(quarter, { from: '2026-04', to: '2027-03' })).toBe(300_000);
    expect(targetShare(quarter, { from: '2027-01', to: '2027-03' })).toBe(0);
  });

  it('lists the shares of the general targets that touch a window, and not a campaign target', async () => {
    await set.execute(admin, { ...base, month: '2026-10', toMonth: '2026-12', targetAmountPaise: 300 });
    await set.execute(admin, { ...base, productId: null, month: '2026-11', targetAmountPaise: 50 });
    await set.execute(admin, { userId: 'mr2', productId: null, campaignId: null, month: '2026-04', targetAmountPaise: 70 });
    const rows = await new ListTargetSharesUseCase(targets).execute(['mr1', 'mr2'], '2026-11', '2026-11');
    expect(rows.map((r) => [r.userId, r.productId, r.sharePaise])).toEqual([['mr1', 'prod1', 100], ['mr1', null, 50]]);
  });

  it('removes a target: Admin or HR; not a manager, not a missing one', async () => {
    const t = await set.execute(admin, { ...base, month: '2026-10', targetAmountPaise: 100 });
    const del = new DeleteTargetUseCase(targets, users, config, today);
    expect(await code(del.execute(f('mr3'), t.id))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(del.execute(f('asm'), t.id))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(del.execute(hr, t.id))).toBeNull();
    expect(await code(del.execute(admin, t.id))).toBe(MARKETING_CODES.targetNotFound);
  });
});

describe('campaigns and visuals', () => {
  it('a campaign cannot end before it starts; field staff see only the active ones', async () => {
    const campaigns = new FakeCampaigns();
    const create = new CreateCampaignUseCase(campaigns);
    await expect(create.execute(admin, { name: 'x', description: '', startDate: '2026-10-10', endDate: '2026-10-09' })).rejects.toMatchObject({ code: MARKETING_CODES.invalidDates });
    const c = await create.execute(admin, { name: 'ok', description: '', startDate: '2026-10-10', endDate: '2026-10-10' }); // a one-day campaign is fine
    await create.execute(admin, { name: 'ok2', description: '', startDate: '2026-10-11', endDate: '2026-10-12' });
    await campaigns.setStatus(c.id, 'completed');
    const list = new ListCampaignsUseCase(campaigns);
    expect((await list.execute(f('mr1'), { status: 'completed' })).map((x) => x.name)).toEqual(['ok2']); // the status filter is Admin's; MRs always get active
    expect((await list.execute(admin, {})).length).toBe(2);
  });

  it('uploads a Visual, general or tied to a product; refuses other file types and a bad product without uploading', async () => {
    const visuals = new FakeVisuals();
    const storage = new FakeStorage();
    const create = new CreateVisualUseCase(visuals, products, storage);
    const file = (mimeType: string) => ({ buffer: Buffer.from('x'), mimeType });
    await create.execute(admin, { productId: null, title: 'Brand', category: 'BRANDING', file: file('image/png') });
    await create.execute(admin, { productId: 'prod1', title: 'Detail', category: 'E_DETAILING', file: file('image/jpeg') });
    await expect(create.execute(admin, { productId: null, title: 'x', category: 'OTHER', file: file('application/pdf') })).rejects.toMatchObject({ code: MARKETING_CODES.unsupportedFile });
    await expect(create.execute(admin, { productId: null, title: 'x', category: 'OTHER', file: file('video/mp4') })).rejects.toMatchObject({ code: MARKETING_CODES.unsupportedFile });
    await expect(create.execute(admin, { productId: null, title: 'x', category: 'OTHER', file: file('application/x-msdownload') })).rejects.toMatchObject({ code: MARKETING_CODES.unsupportedFile });
    await expect(create.execute(admin, { productId: 'prodOff', title: 'x', category: 'OTHER', file: file('image/png') })).rejects.toMatchObject({ code: MARKETING_CODES.productNotFound });
    expect(storage.files.size).toBe(2);
    // The general one still shows in the list; a product filter narrows.
    const list = new ListVisualsUseCase(visuals);
    expect((await list.execute(f('mr1'), {})).length).toBe(2);
    expect((await list.execute(f('mr1'), { productId: 'prod1' })).length).toBe(1);
  });

  it('takes the file back out of storage if the row cannot be written', async () => {
    const visuals = new FakeVisuals();
    visuals.failCreate = true;
    const storage = new FakeStorage();
    await expect(new CreateVisualUseCase(visuals, products, storage).execute(admin, { productId: null, title: 'x', category: 'OTHER', file: { buffer: Buffer.from('x'), mimeType: 'image/png' } })).rejects.toThrow('db down');
    expect(storage.files.size).toBe(0);
  });
});

describe('replace and delete a visual', () => {
  const png = { buffer: Buffer.from('x'), mimeType: 'image/png' };
  const seed = async () => {
    const visuals = new FakeVisuals();
    const storage = new FakeStorage();
    const created = await new CreateVisualUseCase(visuals, products, storage).execute(admin, { productId: null, title: 'Poster', category: 'GENERAL' as never, file: png });
    return { visuals, storage, created };
  };

  it('puts the new file on the visual and takes the old one out of storage', async () => {
    const { visuals, storage, created } = await seed();
    const oldId = created.publicId; // the fake repository hands out the stored row itself, so keep the id before it changes
    const after = await new ReplaceVisualFileUseCase(visuals, storage).execute(created.id, png);
    expect(after.publicId).not.toBe(oldId);
    expect(storage.files.has(oldId)).toBe(false);
    expect(storage.files.has(after.publicId)).toBe(true);
    expect(storage.files.size).toBe(1);
  });

  it('keeps the old file and removes the new one when the visual cannot be updated', async () => {
    const { visuals, storage, created } = await seed();
    const oldId = created.publicId;
    visuals.failReplace = true;
    await expect(new ReplaceVisualFileUseCase(visuals, storage).execute(created.id, png)).rejects.toThrow('db down');
    expect([...storage.files]).toEqual([oldId]);
  });

  it('refuses a file that is not an image and an unknown visual, uploading nothing', async () => {
    const { visuals, storage, created } = await seed();
    const replace = new ReplaceVisualFileUseCase(visuals, storage);
    await expect(replace.execute(created.id, { buffer: Buffer.from('x'), mimeType: 'application/pdf' })).rejects.toMatchObject({ code: MARKETING_CODES.unsupportedFile });
    await expect(replace.execute('nope', png)).rejects.toMatchObject({ code: MARKETING_CODES.visualNotFound });
    expect(storage.files.size).toBe(1);
  });

  it('counts the doctors who have it, then deletes the visual, their picks and the file', async () => {
    const { visuals, storage, created } = await seed();
    const picks = { rows: ['d1', 'd2', 'd2'], deleted: false };
    const doctorVisuals = {
      countDoctorsWith: async () => new Set(picks.rows).size,
      deleteAllFor: async () => void (picks.deleted = true),
    } as never;
    expect(await new GetVisualDeleteImpactUseCase(visuals, doctorVisuals).execute(created.id)).toEqual({ id: created.id, title: 'Poster', doctors: 2 });
    await new DeleteVisualUseCase(visuals, doctorVisuals, storage).execute(created.id);
    expect(visuals.rows).toHaveLength(0);
    expect(picks.deleted).toBe(true);
    expect(storage.files.size).toBe(0);
    await expect(new DeleteVisualUseCase(visuals, doctorVisuals, storage).execute(created.id)).rejects.toMatchObject({ code: MARKETING_CODES.visualNotFound });
  });
});
