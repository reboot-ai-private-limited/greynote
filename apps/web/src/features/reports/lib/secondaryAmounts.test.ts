import { describe, expect, it } from 'vitest';
import { filterDistributors, lineAmounts, totalAmounts } from './secondaryAmounts';

const line = (over: object = {}) => ({ openingQty: 10, primaryQty: 5, issuedQty: 8, closingQty: 7, ptsPaise: 2_500, ...over });

describe('secondary amounts', () => {
  it('prices every figure at the PTS', () => {
    expect(lineAmounts(line())).toEqual({ opening: 25_000, primary: 12_500, issued: 20_000, closing: 17_500 });
  });
  it('a product with no PTS has no amount, and adds nothing to the totals', () => {
    expect(lineAmounts(line({ ptsPaise: null })).issued).toBeNull();
    expect(totalAmounts([line(), line({ ptsPaise: null })])).toEqual({ opening: 25_000, primary: 12_500, issued: 20_000, closing: 17_500, unpriced: 1 });
  });
});

describe('filterDistributors', () => {
  const ds = [{ name: 'MK MEDICINE', lines: [line()] }, { name: 'H.S MED DISTRIBUTORS', lines: [line({ issuedQty: 1 })] }, { name: 'AMIT ENTERPRISE', lines: [line()] }];
  it('keeps the distributors that have every typed word in their name, in any case', () => {
    expect(filterDistributors(ds, 'med').map((d) => d.name)).toEqual(['MK MEDICINE', 'H.S MED DISTRIBUTORS']);
    expect(filterDistributors(ds, 'mk MED').map((d) => d.name)).toEqual(['MK MEDICINE']);
    expect(filterDistributors(ds, 'dist med').map((d) => d.name)).toEqual(['H.S MED DISTRIBUTORS']);
  });
  it('an empty or blank search keeps them all, and no match keeps none', () => {
    expect(filterDistributors(ds, '')).toHaveLength(3);
    expect(filterDistributors(ds, '   ')).toHaveLength(3);
    expect(filterDistributors(ds, 'zzz')).toEqual([]);
  });
  it('the totals of the filtered list are the sum of those distributors', () => {
    const shown = filterDistributors(ds, 'amit');
    expect(totalAmounts(shown.flatMap((d) => d.lines)).issued).toBe(20_000);
  });
});
