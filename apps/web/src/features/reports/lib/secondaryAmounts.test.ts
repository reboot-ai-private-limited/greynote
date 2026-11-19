import { describe, expect, it } from 'vitest';
import { lineAmounts, totalAmounts } from './secondaryAmounts';

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
