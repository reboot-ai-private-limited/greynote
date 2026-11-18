'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { SecondaryReportLineDto } from '@greynote/contracts';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { monthsInYear } from '@/features/attendance/lib/attendance';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { withAuth } from '@/lib/auth/session';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { downloadBlob } from '@/lib/download';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useSecondaryReport } from '../hooks/useSalesReport';

const money = (p: number | null): string => (p === null ? '—' : formatMoney(p));

/** One product row; tapping it shows the MRs behind the figures. */
function ProductRow({ line }: { line: SecondaryReportLineDto }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className="cursor-pointer border-t border-border hover:bg-surface-muted" onClick={() => setOpen((o) => !o)}>
        <td className="px-3 py-2 font-medium">
          <button type="button" className="inline-flex items-center gap-1" aria-expanded={open} aria-label={`${line.product.name}: ${open ? 'hide' : 'show'} MRs`}>
            {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
            {line.product.name}
          </button>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{line.openingQty}</td>
        <td className="px-3 py-2 text-right tabular-nums">{line.primaryQty}</td>
        <td className="px-3 py-2 text-right tabular-nums">{line.issuedQty}</td>
        <td className="px-3 py-2 text-right tabular-nums">{line.closingQty}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(line.issuedAmountPaise)}</td>
      </tr>
      {open
        ? line.byMr.map((m) => (
            <tr key={m.userId} className="bg-surface-muted text-text-muted">
              <td className="py-1.5 pl-9 pr-3">{m.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{m.openingQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{m.primaryQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{m.issuedQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{m.closingQty}</td>
              <td className="px-3 py-1.5" />
            </tr>
          ))
        : null}
    </Fragment>
  );
}

/**
 * Secondary sales as the MRs entered them and their managers approved (decision-log 2026-11-05): every distributor's products, summed over the MRs, so a
 * product is counted once however many MRs serve the distributor. Units, and the value at PTS.
 */
export function SecondaryReportScreen() {
  const { values, update } = useFilterParams(['month']);
  const { year } = useFinancialYear();
  const months = monthsInYear(year ?? financialYearOf(istDate()), istDate());
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const query = useSecondaryReport(month);
  const fy = year ?? financialYearOf(istDate());
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // The Excel of the financial year selected at the top of the page (not a fixed year): a sheet per MR and a roll-up per manager.
  const downloadSheet = async () => {
    setSheetBusy(true);
    setSheetError(null);
    try {
      const file = await withAuth((token) => reportsApi.secondarySheet(token));
      downloadBlob(`GREYNOTE SECONDARY SALES ${financialYearLabel(fy).replace('–', '-')}.xlsx`, file);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setSheetBusy(false);
    }
  };
  const report = query.data;
  const empty = !report || report.distributors.length === 0;
  return (
    <>
      <PageHeader
        title="Secondary sales"
        description="Approved secondary of the MRs, by distributor and product. Closing is opening + primary − secondary; the value is units × PTS."
        actions={
          <Button variant="secondary" disabled={sheetBusy} onClick={() => void downloadSheet()}>
            {sheetBusy ? 'Preparing…' : `Download Excel · ${financialYearLabel(fy)}`}
          </Button>
        }
      />
      {sheetError ? <p role="alert" className="mb-3 text-[13px] text-danger">{sheetError}</p> : null}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Secondary (units)" value={report?.totals.issuedQty ?? 0} />
        <StatTile label="Secondary value" value={formatMoney(report?.totals.issuedAmountPaise ?? 0)} />
        <StatTile label="Closing (units)" value={report?.totals.closingQty ?? 0} />
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
                <table className="w-full min-w-[34rem] text-[13px]">
                  <thead>
                    <tr className="text-left text-text-muted">
                      <th className="px-3 py-1.5 font-medium">Product</th>
                      <th className="px-3 py-1.5 text-right font-medium">Opening</th>
                      <th className="px-3 py-1.5 text-right font-medium">Primary</th>
                      <th className="px-3 py-1.5 text-right font-medium">Secondary</th>
                      <th className="px-3 py-1.5 text-right font-medium">Closing</th>
                      <th className="px-3 py-1.5 text-right font-medium">Value at PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <ProductRow key={l.product.id} line={l} />
                    ))}
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.totals.openingQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.totals.primaryQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.totals.issuedQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.totals.closingQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(d.totals.issuedAmountPaise)}</td>
                    </tr>
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
