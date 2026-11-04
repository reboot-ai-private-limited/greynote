'use client';

import type { StockCountLineDto, StockCountsMonthDto } from '@greynote/contracts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatMoney } from '@/lib/format';

const COLUMNS: readonly Column<StockCountLineDto>[] = [
  {
    key: 'product',
    header: 'Product',
    render: (l) => <span className="font-medium">{l.product.name}</span>,
  },
  { key: 'opening', header: 'Opening', numeric: true, render: (l) => l.openingQty },
  { key: 'delivered', header: 'Delivered', numeric: true, render: (l) => l.deliveredQty },
  { key: 'closing', header: 'Closing', numeric: true, render: (l) => l.closingQty },
  {
    key: 'secondary',
    header: 'Secondary',
    numeric: true,
    render: (l) => (l.secondaryQty === null ? '—' : l.secondaryQty),
  },
  {
    key: 'amount',
    header: 'Amount at PTS',
    numeric: true,
    render: (l) => (l.secondaryAmountPaise === null ? '—' : formatMoney(l.secondaryAmountPaise)),
  },
];

/** One table per distributor: each product's opening, delivered, closing and the secondary that follows. */
export function DistributorCountTables({
  distributors,
}: {
  distributors: StockCountsMonthDto['distributors'];
}) {
  return (
    <>
      {distributors.map((d) => (
        <div key={d.distributorId} className="space-y-1.5">
          <h3 className="text-[13px] font-semibold text-text">{d.name}</h3>
          <DataTable columns={COLUMNS} rows={d.lines} rowKey={(l) => l.product.id} bleed={false} />
        </div>
      ))}
    </>
  );
}

export interface ProductTotal {
  id: string;
  name: string;
  qty: number;
  paise: number | null;
}

/** Every product's secondary added up over the distributors, for the totals table and the comparison. */
export function totalsByProduct(distributors: StockCountsMonthDto['distributors']): ProductTotal[] {
  const out = new Map<string, ProductTotal>();
  for (const d of distributors) {
    for (const l of d.lines) {
      if (l.secondaryQty === null) continue;
      const row = out.get(l.product.id) ?? {
        id: l.product.id,
        name: l.product.name,
        qty: 0,
        paise: 0,
      };
      row.qty += l.secondaryQty;
      row.paise =
        row.paise === null || l.secondaryAmountPaise === null
          ? null
          : row.paise + l.secondaryAmountPaise;
      out.set(l.product.id, row);
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
