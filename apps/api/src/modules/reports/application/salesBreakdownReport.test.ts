import { describe, expect, it } from 'vitest';
import { MrStockFigures } from './mrStockFigures.js';
import { SalesBreakdownReport } from './salesBreakdownReport.js';

const config = { get: async (key: string) => ({ FY_START_MONTH: 'APRIL', BUSINESS_TIMEZONE: 'Asia/Kolkata' })[key] ?? '' };
const ml = (userId: string, distributorId: string, productId: string, month: string, primaryQty: number, issuedQty: number) => ({ userId, distributorId, productId, month, openingQty: 0, primaryQty, issuedQty });

type Rollup = { userId: string; month: string; status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'; lines: Array<{ distributorId: string; productId: string; openingQty: number; primaryQty: number; issuedQty: number }> };

function build(lines: ReturnType<typeof ml>[], rollups: Rollup[] = []) {
  const dashboard = { audience: async () => [{ id: 'mr1', name: 'Asha', employeeCode: 'E1', designation: 'MR' }, { id: 'mr2', name: 'Bala', employeeCode: 'E2', designation: 'MR' }, { id: 'asm', name: 'Chitra', employeeCode: 'E3', designation: 'ASM' }] };
  const marketing = { listTargetShares: async () => [{ id: 't1', userId: 'mr1', productId: 'p1', fromMonth: '2026-10', toMonth: '2026-10', amountPaise: 10_000, qty: null, sharePaise: 10_000, shareQty: null }] };
  const master = {
    listNames: async (q: { productIds?: string[]; distributorIds?: string[] }) => ({
      distributors: [{ id: 'd1', name: 'Shree' }, { id: 'd2', name: 'Maa Tara' }].filter((d) => (q.distributorIds ?? []).includes(d.id)),
      chemists: [],
      products: [{ id: 'p1', name: 'Amox', sku: 'AMX', ptrPaise: 1000, ptsPaise: 800 }, { id: 'p2', name: 'Cetri', sku: 'CET', ptrPaise: null, ptsPaise: null }].filter((p) => (q.productIds ?? []).includes(p.id)),
    }),
    listActiveOutlets: async () => ({ distributors: [{ id: 'd1', name: 'Shree' }, { id: 'd2', name: 'Maa Tara' }], chemists: [] }),
  };
  const roster = { getDownline: async (id: string) => (id === 'asm' ? [{ id: 'mr1' }, { id: 'mr2' }] : []), getDesignationLevels: async (ids: string[]) => ids.map((userId) => ({ userId, level: userId === 'asm' ? 2 : 1 })) };
  const figures = new MrStockFigures({
    listSecondaryLines: async (f) => lines.filter((l) => (!f.userIds || f.userIds.includes(l.userId)) && l.month >= f.fromMonth && l.month <= f.toMonth),
    listSecondaryRollups: async (f) => rollups.filter((r) => (!f.userIds || f.userIds.includes(r.userId)) && (f.statuses ?? ['APPROVED']).includes(r.status)),
  });
  return new SalesBreakdownReport(dashboard as never, marketing as never, master as never, figures, roster as never, config);
}
const win = { year: 2026, period: 'month' as const, month: '2026-10' };

describe('sales by product and distributor', () => {
  it('a product is the sum of the MRs’ approved rows: MR 2 + MR 4 = 6, valued at PTS, with its target', async () => {
    const out = await build([ml('mr1', 'd1', 'p1', '2026-10', 5, 2), ml('mr2', 'd1', 'p1', '2026-10', 5, 4)]).byProduct(win);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ product: { name: 'Amox' }, primaryQty: 10, primaryPaise: 8_000, secondaryQty: 6, secondaryPaise: 4_800, targetPaise: 10_000, achievementPercent: 48 });
    expect(out.totals).toMatchObject({ primaryQty: 10, secondaryQty: 6, secondaryPaise: 4_800, targetPaise: 10_000 });
  });

  it('nothing approved reads 0 and keeps the target row', async () => {
    const out = await build([]).byProduct(win);
    expect(out.rows[0]).toMatchObject({ product: { name: 'Amox' }, primaryQty: 0, secondaryQty: 0, secondaryPaise: 0, targetPaise: 10_000, achievementPercent: 0 });
    expect(out.totals).toMatchObject({ primaryPaise: 0, secondaryPaise: 0 });
  });

  it('a distributor shared by two MRs is one row holding both slices; one with no rows is listed as missing', async () => {
    const out = await build([ml('mr1', 'd1', 'p1', '2026-10', 5, 2), ml('mr2', 'd1', 'p2', '2026-10', 1, 4)]).byDistributor(win);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ distributor: { name: 'Shree' }, primaryQty: 6, secondaryQty: 6, secondaryPaise: 1_600, products: 2, countedMonths: 1 });
    expect(out.missingDistributors.map((d) => d.id)).toEqual(['d2']);
  });

  it('by employee: a manager is judged by their own approved team report, MRs by their rows; the total counts each MR once', async () => {
    const rollups: Rollup[] = [{ userId: 'asm', month: '2026-10', status: 'APPROVED', lines: [{ distributorId: 'd1', productId: 'p1', openingQty: 0, primaryQty: 10, issuedQty: 6 }] }];
    const out = await build([ml('mr1', 'd1', 'p1', '2026-10', 5, 2), ml('mr2', 'd1', 'p1', '2026-10', 5, 4)], rollups).byEmployee({ ...win, actor: { id: 'admin', role: 'ADMIN' } });
    expect(out.rows.find((r) => r.employee.id === 'asm')!).toMatchObject({ achievedPaise: 4_800, primaryPaise: 8_000, mrCount: 2, rollupStatus: 'APPROVED' });
    const none = await build([ml('mr1', 'd1', 'p1', '2026-10', 5, 2), ml('mr2', 'd1', 'p1', '2026-10', 5, 4)]).byEmployee({ ...win, actor: { id: 'admin', role: 'ADMIN' } });
    expect(none.rows.find((r) => r.employee.id === 'asm')!).toMatchObject({ achievedPaise: 0, primaryPaise: 0, rollupStatus: 'NOT_SUBMITTED' });
    expect(none.totals).toMatchObject({ achievedPaise: 4_800 });
    expect(out.rows.find((r) => r.employee.id === 'mr1')!).toMatchObject({ achievedPaise: 1_600 });
    expect(out.totals).toMatchObject({ achievedPaise: 4_800, primaryPaise: 8_000 });
  });
});
