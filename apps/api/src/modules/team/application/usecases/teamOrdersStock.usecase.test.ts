import { beforeEach, describe, expect, it } from 'vitest';
import type { TeamOrder } from '../../domain/ports.js';
import { FakeTeam } from './teamKit.js';
import { TeamOrdersUseCase, type TeamOrdersQuery } from './teamOrders.usecase.js';
import { TeamStockUseCase } from './teamStock.usecase.js';

let fake: FakeTeam;
beforeEach(() => {
  fake = new FakeTeam();
});

const order = (
  id: string,
  userId: string,
  orderDate: string,
  status: TeamOrder['status'],
  totalAmountPaise: number,
  outlet: TeamOrder['outlet'] = { type: 'CHEMIST', id: 'c1' },
): TeamOrder => ({
  id,
  userId,
  outlet,
  orderDate,
  status,
  totalAmountPaise,
  remarks: null,
  items: [{}, {}],
});

describe('TeamOrders', () => {
  const base: TeamOrdersQuery = {
    from: '2026-10-01',
    to: '2026-10-31',
    scope: 'all',
    page: 1,
    pageSize: 50,
  };
  const run = (q: Partial<TeamOrdersQuery> = {}, manager = 'rsm') =>
    new TeamOrdersUseCase(fake, fake, fake).execute(manager, { ...base, ...q });

  beforeEach(() => {
    fake.orders = [
      order('o1', 'mr1', '2026-10-05', 'DONE', 10_000, { type: 'DISTRIBUTOR', id: 'd1' }),
      order('o2', 'mr1', '2026-10-09', 'PLACED', 2_500),
      order('o3', 'mr2', '2026-10-07', 'CANCELLED', 900),
      order('o4', 'stranger', '2026-10-07', 'DONE', 77_000),
    ];
  });

  it('lists the team’s orders newest first, with names, and never anyone else’s', async () => {
    const r = await run();
    expect(r.items.map((i) => i.id)).toEqual(['o2', 'o3', 'o1']);
    expect(r.items[0]).toMatchObject({
      user: { id: 'mr1', name: 'Person mr1' },
      outlet: { type: 'CHEMIST', name: 'Chem c1' },
      itemCount: 2,
    });
    expect(r.items[2]?.outlet.name).toBe('Dist d1');
  });

  it('totals everything matched, with Cancelled left out of the amount', async () => {
    const r = await run({ pageSize: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.totals).toEqual({
      count: 3,
      amountPaise: 12_500,
      byStatus: {
        PLACED: { count: 1, amountPaise: 2_500 },
        DONE: { count: 1, amountPaise: 10_000 },
        CANCELLED: { count: 1, amountPaise: 900 },
      },
    });
    expect(r).toMatchObject({ total: 3, totalPages: 3, truncated: false });
  });

  it('filters by status, outlet type, person and window', async () => {
    expect((await run({ status: 'DONE' })).items.map((i) => i.id)).toEqual(['o1']);
    expect((await run({ outletType: 'DISTRIBUTOR' })).items.map((i) => i.id)).toEqual(['o1']);
    expect((await run({ userId: 'mr2' })).items.map((i) => i.id)).toEqual(['o3']);
    expect((await run({ from: '2026-10-08' })).items.map((i) => i.id)).toEqual(['o2']);
  });

  it('shows a removed outlet as such', async () => {
    fake.orders = [
      order('o9', 'mr1', '2026-10-05', 'DONE', 1, { type: 'DISTRIBUTOR', id: 'gone' }),
    ];
    expect((await run()).items[0]?.outlet.name).toBe('(removed)');
  });

  it('says so when a person has more orders than were read', async () => {
    fake.orders = Array.from({ length: 501 }, (_, i) =>
      order(`x${i}`, 'mr1', '2026-10-05', 'PLACED', 1),
    );
    expect((await run({ userId: 'mr1' })).truncated).toBe(true);
  });

  it('refuses a person outside the downline, a backwards or oversized window, and gives a manager with no team nothing', async () => {
    await expect(run({ userId: 'stranger' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(run({ from: '2026-10-10', to: '2026-10-01' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(run({ from: '2026-01-01', to: '2026-12-31' })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect((await run({}, 'mr1')).items).toEqual([]);
  });
});

describe('TeamStock', () => {
  const base = { month: '2026-09', scope: 'all', page: 1, pageSize: 50 } as const;
  const run = (q: Partial<Parameters<TeamStockUseCase['execute']>[1]> = {}, manager = 'rsm') =>
    new TeamStockUseCase(fake, fake).execute(manager, { ...base, ...q });
  const outlet = { type: 'CHEMIST', id: 'c1', name: 'Chem 1' } as const;

  beforeEach(() => {
    fake.missing.set('mr1', [outlet]);
    fake.secondary.set('asm1', 'PENDING');
    fake.secondary.set('asm2', 'APPROVED');
    fake.secondary.set('mr1', 'DRAFT');
  });

  it('shows each active person’s missing outlets and secondary, chase-first', async () => {
    const r = await run();
    expect(r.items.map((i) => [i.user.id, i.secondary, i.missingOutlets.length])).toEqual([
      ['mr1', 'DRAFT', 1],
      ['asm1', 'PENDING', 0],
      ['mr2', 'NOT_ENTERED', 0],
      ['asm2', 'APPROVED', 0],
    ]);
  });

  it('flags a direct report’s sent month as waiting on the manager, but not a deeper one', async () => {
    fake.secondary.set('mr2', 'PENDING');
    const r = await run();
    expect(r.items.find((i) => i.user.id === 'asm1')?.waitingOnYou).toBe(true);
    expect(r.items.find((i) => i.user.id === 'mr2')?.waitingOnYou).toBe(false);
  });

  it('counts everyone in the tiles, whatever the filter', async () => {
    const r = await run({ missingStock: true });
    expect(r.items.map((i) => i.user.id)).toEqual(['mr1']);
    expect(r.tiles).toEqual({
      total: 4,
      withMissingStock: 1,
      secondary: { NOT_ENTERED: 1, DRAFT: 1, PENDING: 1, APPROVED: 1, REJECTED: 0 },
    });
    expect((await run({ secondary: 'APPROVED' })).items.map((i) => i.user.id)).toEqual(['asm2']);
  });

  it('refuses a person outside the downline and gives a manager with no team nothing', async () => {
    await expect(run({ userId: 'stranger' })).rejects.toMatchObject({ statusCode: 403 });
    expect((await run({}, 'mr1')).items).toEqual([]);
  });
});
