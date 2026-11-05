'use client';

import type { SecondaryStockDistributorDto, SecondaryStockLineDto, SecondaryStockTotalsDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatMoney } from '@/lib/format';

const amount = (paise: number | null): string => (paise === null ? '—' : formatMoney(paise));

/** A figure the MR changed from its default is marked, so the manager sees it was corrected. */
const edited = (on: boolean, n: number) => (on ? <span className="font-semibold text-warning-fg" title="Differs from the suggested figure">{n}*</span> : n);

const COLUMNS: readonly Column<SecondaryStockLineDto>[] = [
  { key: 'product', header: 'Product', render: (l) => <span className="font-medium">{l.product.name}</span> },
  { key: 'opening', header: 'Opening', numeric: true, render: (l) => edited(l.openingEdited, l.openingQty) },
  { key: 'primary', header: 'Primary', numeric: true, render: (l) => edited(l.primaryEdited, l.primaryQty) },
  { key: 'issued', header: 'Secondary', numeric: true, render: (l) => l.issuedQty },
  { key: 'closing', header: 'Closing', numeric: true, render: (l) => l.closingQty },
  { key: 'value', header: 'Secondary at PTS', numeric: true, render: (l) => amount(l.issuedAmountPaise) },
];

export function TotalsLine({ totals }: { totals: SecondaryStockTotalsDto }) {
  return (
    <p className="text-[13px] text-text-muted">
      Total: opening <b>{totals.openingQty}</b> · primary <b>{totals.primaryQty}</b> · secondary <b>{totals.issuedQty}</b> · closing <b>{totals.closingQty}</b> · secondary value <b>{formatMoney(totals.issuedAmountPaise)}</b>
    </p>
  );
}

/** One table per distributor: only the products the MR has something for, then the distributor's totals. Rows kept at their defaults and zero are left out. */
export function SecondaryStockTables({ distributors }: { distributors: readonly SecondaryStockDistributorDto[] }) {
  return (
    <>
      {distributors
        .map((d) => ({ d, rows: d.lines.filter((l) => l.saved) }))
        .filter(({ rows }) => rows.length > 0)
        .map(({ d, rows }) => (
          <div key={d.distributorId} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-text">{d.name}</h3>
              <Badge tone="neutral">{d.status}</Badge>
            </div>
            <DataTable columns={COLUMNS} rows={rows} rowKey={(l) => l.product.id} bleed={false} />
            <TotalsLine totals={d.totals} />
          </div>
        ))}
    </>
  );
}
