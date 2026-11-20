'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { SecondaryReportLineDto } from '@greynote/contracts';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { monthsInYear } from '@/features/attendance/lib/attendance';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useSecondaryReport } from '../hooks/useSalesReport';
import { lineAmounts, priced, totalAmounts } from '../lib/secondaryAmounts';

const money = (p: number | null): string => (p === null ? '—' : formatMoney(p));

/** One product row; tapping it shows the MRs behind the figures. */
function ProductRow({ line }: { line: SecondaryReportLineDto }) {
  const [open, setOpen] = useState(false);
  const amounts = lineAmounts(line);
  return (
    <Fragment>
      <tr className="cursor-pointer border-t border-border hover:bg-surface-muted" onClick={() => setOpen((o) => !o)}>
        <td className="px-3 py-2 font-medium">
          <button type="button" className="inline-flex items-center gap-1" aria-expanded={open} aria-label={`${line.product.name}: ${open ? 'hide' : 'show'} MRs`}>
            {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
            {line.product.name}
          </button>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{line.ptsPaise === null ? '—' : formatMoney(line.ptsPaise)}</td>
        <td className="px-3 py-2 text-right tabular-nums" title={`${line.openingQty} units`}>{money(amounts.opening)}</td>
        <td className="px-3 py-2 text-right tabular-nums" title={`${line.primaryQty} units`}>{money(amounts.primary)}</td>
        <td className="px-3 py-2 text-right tabular-nums" title={`${line.issuedQty} units`}>{money(amounts.issued)}</td>
        <td className="px-3 py-2 text-right tabular-nums" title={`${line.closingQty} units`}>{money(amounts.closing)}</td>
      </tr>
      {open
        ? line.byMr.map((m) => (
            <tr key={m.userId} className="bg-surface-muted text-text-muted">
              <td className="py-1.5 pl-9 pr-3">{m.name}</td>
              <td className="px-3 py-1.5" />
              <td className="px-3 py-1.5 text-right tabular-nums" title={`${m.openingQty} units`}>{money(priced(m.openingQty, line.ptsPaise))}</td>
              <td className="px-3 py-1.5 text-right tabular-nums" title={`${m.primaryQty} units`}>{money(priced(m.primaryQty, line.ptsPaise))}</td>
              <td className="px-3 py-1.5 text-right tabular-nums" title={`${m.issuedQty} units`}>{money(priced(m.issuedQty, line.ptsPaise))}</td>
              <td className="px-3 py-1.5 text-right tabular-nums" title={`${m.closingQty} units`}>{money(priced(m.closingQty, line.ptsPaise))}</td>
            </tr>
          ))
        : null}
    </Fragment>
  );
}

/**
 * Secondary sales as the MRs entered them and their managers approved (decision-log 2026-11-05): every distributor's products, summed over the MRs, so a
 * product is counted once however many MRs serve the distributor. Shown as amounts: units × PTS (hover a figure for its units).
 */
export function SecondaryReportScreen() {
  const { values, update } = useFilterParams(['month']);
  const { year } = useFinancialYear();
  const months = monthsInYear(year ?? financialYearOf(istDate()), istDate());
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const query = useSecondaryReport(month);
  const report = query.data;
  const empty = !report || report.distributors.length === 0;
  const all = totalAmounts((report?.distributors ?? []).flatMap((d) => d.lines));
  return (
    <>
      <PageHeader
        title="Distributor sales"
        description="Approved secondary of the MRs, by distributor and product. Closing is opening + primary − secondary. Every figure is in rupees: units × the product's PTS (hover for the units). A product with no PTS shows —."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Secondary (₹)" value={formatMoney(all.issued)} />
        <StatTile label="Closing stock (₹)" value={formatMoney(all.closing)} />
        <StatTile label="Primary (₹)" value={formatMoney(all.primary)} />
        <StatTile label="MRs approved" value={`${report?.approvedMrCount ?? 0} of ${report?.mrCount ?? 0}`} />
      </div>
      <Card flat>
        <DataState
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={empty}
          empty={{ title: `No approved secondary for ${month ? monthLabel(month) : 'this month'}`, description: 'Figures appear here once an MR submits a month and the manager approves it.' }}
        >
          <div className="space-y-5 p-4">
            {(report?.distributors ?? []).map((d) => (
              <div key={d.distributorId} className="overflow-x-auto">
                <h3 className="mb-1.5 text-[13px] font-semibold text-text">{d.name}</h3>
                <table className="w-full min-w-[38rem] text-[13px]">
                  <thead>
                    <tr className="text-left text-text-muted">
                      <th className="px-3 py-1.5 font-medium">Product</th>
                      <th className="px-3 py-1.5 text-right font-medium">PTS</th>
                      <th className="px-3 py-1.5 text-right font-medium">Opening (₹)</th>
                      <th className="px-3 py-1.5 text-right font-medium">Primary (₹)</th>
                      <th className="px-3 py-1.5 text-right font-medium">Secondary (₹)</th>
                      <th className="px-3 py-1.5 text-right font-medium">Closing (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <ProductRow key={l.product.id} line={l} />
                    ))}
                    {(() => {
                      const t = totalAmounts(d.lines);
                      return (
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="px-3 py-2">
                            Total
                            {t.unpriced > 0 ? <span className="ml-2 text-xs font-normal text-text-subtle">{`${t.unpriced} product${t.unpriced === 1 ? '' : 's'} with no PTS not counted`}</span> : null}
                          </td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.opening)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.primary)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.issued)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(t.closing)}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </DataState>
      </Card>
    </>
  );
}
