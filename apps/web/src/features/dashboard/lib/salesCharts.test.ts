import type { SalesByEmployeeDto, SalesByProductDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { achievementSlices, employeeTargets, pieSlices, productTargets, rankedEmployees, rankedProducts, topAchievers, topProducts } from './salesCharts';

const employees = (rows: Array<[string, number, number]>) =>
  ({
    rows: rows.map(([name, targetPaise, achievedPaise]) => ({
      employee: { id: name, name, employeeCode: name },
      designation: null,
      targetPaise,
      primaryPaise: 0,
      achievedPaise,
      achievementPercent: targetPaise > 0 ? Math.round((achievedPaise / targetPaise) * 100) : null,
      mrCount: null,
    })),
  }) as unknown as SalesByEmployeeDto;

const products = (rows: Array<[string, number, number]>) =>
  ({
    rows: rows.map(([name, targetPaise, secondaryPaise]) => ({
      product: { id: name, name, sku: name },
      targetPaise,
      secondaryPaise,
      achievementPercent: targetPaise > 0 ? Math.round((secondaryPaise / targetPaise) * 100) : null,
    })),
  }) as unknown as SalesByProductDto;

describe('achievementSlices', () => {
  it('splits achieved from remaining', () => {
    expect(achievementSlices(1000, 250)).toEqual({ achievedPaise: 250, remainingPaise: 750, percent: 25 });
  });
  it('fills the donut but reports the true percent when over target', () => {
    expect(achievementSlices(1000, 1300)).toEqual({ achievedPaise: 1300, remainingPaise: 0, percent: 130 });
  });
  it('has no percent without a target and ignores negative achievement', () => {
    expect(achievementSlices(0, 500).percent).toBeNull();
    expect(achievementSlices(1000, -50)).toEqual({ achievedPaise: 0, remainingPaise: 1000, percent: 0 });
  });
});

describe('ranking', () => {
  it('ranks top achievers highest first, dropping zero, capped at n', () => {
    const r = employees([['A', 0, 100], ['B', 0, 300], ['C', 0, 0], ['D', 0, 200]]);
    expect(topAchievers(r, 2).map((x) => x.label)).toEqual(['B', 'D']);
    expect(topAchievers(r).map((x) => x.label)).toEqual(['B', 'D', 'A']);
  });
  it('ranks top products by secondary value, ties by name', () => {
    const r = products([['Zed', 0, 100], ['Alpha', 0, 100], ['Mid', 0, 500]]);
    expect(topProducts(r).map((x) => x.label)).toEqual(['Mid', 'Alpha', 'Zed']);
  });
});

describe('target lists', () => {
  it('keeps only rows with a target, largest first', () => {
    expect(productTargets(products([['A', 100, 10], ['B', 0, 50], ['C', 300, 30]])).map((x) => x.label)).toEqual(['C', 'A']);
    expect(employeeTargets(employees([['A', 100, 10], ['B', 0, 50], ['C', 300, 30]])).map((x) => x.label)).toEqual(['C', 'A']);
  });
});

describe('full rankings and pie', () => {
  it('ranks every row, most first, keeping zeros at the end', () => {
    expect(rankedProducts(products([['A', 0, 0], ['B', 0, 300], ['C', 0, 100]])).map((x) => x.label)).toEqual(['B', 'C', 'A']);
    expect(rankedEmployees(employees([['A', 0, 5], ['B', 0, 9]])).map((x) => x.label)).toEqual(['B', 'A']);
  });
  it('folds everything past the top n into Others, and omits it when nothing is left', () => {
    const ranked = rankedProducts(products([['A', 0, 50], ['B', 0, 40], ['C', 0, 30], ['D', 0, 20], ['E', 0, 0]]));
    expect(pieSlices(ranked, 2)).toEqual([
      { id: 'A', label: 'A', valuePaise: 50 },
      { id: 'B', label: 'B', valuePaise: 40 },
      { id: 'others', label: 'Others', valuePaise: 50 },
    ]);
    expect(pieSlices(ranked, 4).map((x) => x.label)).toEqual(['A', 'B', 'C', 'D']);
  });
});
