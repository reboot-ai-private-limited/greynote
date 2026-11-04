import type { SalesByEmployeeDto, SalesByProductDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { employeeTrend, orgSummary, productTrend, sortTrend, trendColumns } from './salesTrend';

const prod = (rows: Array<[string, number, number]>) =>
  ({ rows: rows.map(([n, secondaryPaise, targetPaise]) => ({ product: { id: n, name: n, sku: n.toUpperCase() }, secondaryPaise, targetPaise })), totals: {} }) as unknown as SalesByProductDto;
const emp = (rows: Array<[string, number, number]>, totals = { targetPaise: 0, achievedPaise: 0, achievementPercent: null as number | null }) =>
  ({ rows: rows.map(([n, achievedPaise, targetPaise]) => ({ employee: { id: n, name: n, employeeCode: `E-${n}` }, achievedPaise, targetPaise })), totals }) as unknown as SalesByEmployeeDto;

describe('trendColumns', () => {
  it('is twelve months or four quarters of the year, each with its API window', () => {
    const months = trendColumns(2026, 'month', (m) => m);
    expect(months).toHaveLength(12);
    expect(months[0]!.window).toEqual({ year: 2026, period: 'month', month: months[0]!.key });
    const quarters = trendColumns(2026, 'quarter', (m) => m);
    expect(quarters.map((c) => c.window.quarter)).toEqual([1, 2, 3, 4]);
  });
});

describe('productTrend', () => {
  it('joins columns by product, zero-fills a missing month, and orders by year total', () => {
    const rows = productTrend([prod([['A', 100, 200]]), prod([['A', 50, 200], ['B', 400, 0]])], prod([['A', 150, 400], ['B', 400, 0]]));
    expect(rows.map((r) => r.label)).toEqual(['B', 'A']);
    const b = rows[0]!;
    expect(b.cells[0]!.valuePaise).toBe(0);
    expect(b.cells[1]!.valuePaise).toBe(400);
    expect(b.total.percent).toBeNull();
    const a = rows[1]!;
    expect(a.cells.map((c) => c.percent)).toEqual([50, 25]);
    expect(a.total).toEqual({ valuePaise: 150, targetPaise: 400, percent: 38 });
  });
});

describe('employeeTrend / sortTrend', () => {
  const rows = employeeTrend([emp([['Zed', 10, 0], ['Amy', 30, 0]]), emp([['Zed', 90, 0]])], emp([['Zed', 100, 0], ['Amy', 30, 0]]));
  it('defaults to most sold first', () => expect(rows.map((r) => r.label)).toEqual(['Zed', 'Amy']));
  it('sorts by a month column, or by name', () => {
    expect(sortTrend(rows, { key: '0', order: 'desc' }).map((r) => r.label)).toEqual(['Amy', 'Zed']);
    expect(sortTrend(rows, { key: 'label', order: 'asc' }).map((r) => r.label)).toEqual(['Amy', 'Zed']);
  });
});

describe('orgSummary', () => {
  it('reads overall, best performers and who is behind', () => {
    const s = orgSummary(emp([['A', 80, 100], ['B', 150, 100], ['C', 5, 0]], { targetPaise: 200, achievedPaise: 235, achievementPercent: 118 }), prod([['X', 10, 100], ['Y', 500, 400]]));
    expect(s).toMatchObject({ targetPaise: 200, achievedPaise: 235, percent: 118, employeesBehind: 1, employeesWithTarget: 2, productsBehind: 1, productsWithTarget: 2 });
    expect(s.bestEmployee).toEqual({ label: 'B', valuePaise: 150 });
    expect(s.bestProduct).toEqual({ label: 'Y', valuePaise: 500 });
  });
  it('handles no data', () => {
    expect(orgSummary(undefined, undefined)).toMatchObject({ targetPaise: 0, percent: null, bestEmployee: null, bestProduct: null });
  });
});
