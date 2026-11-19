'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate, formatMoney } from '@/lib/format';
import { downloadXlsx } from '@/lib/xlsx';
import { useInvoice } from '../hooks/useInvoices';
import { COMPANY } from '../lib/company';
import { expiryLabel, invoiceFilename, invoiceLinesTable, rupeesInWords, taxBreakup } from '../lib/invoices';

const TH = 'border border-border-strong bg-surface-hover px-2 py-1.5 font-semibold print:px-1 print:py-0.5 print:[print-color-adjust:exact]';
const TD = 'border border-border-strong px-2 py-1.5 print:px-1 print:py-0.5';

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-6 py-0.5 print:gap-3 print:py-0 ${bold ? 'font-semibold' : ''}`}>
    <span>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

/**
 * One invoice laid out like the Tax Invoice the company issues today: seller block, bill-to, lines with GST, totals, amount in words and the tax
 * table. Rendered here from what the order holds and printed (or saved as PDF) from the browser; nothing is stored. HSN, batch and expiry are
 * kept on the line when the order is marked Done; an invoice from before that shows a dash. The logo heads the page, faint behind everything as a watermark, and the signed company seal
 * sits above the signatory line.
 */
export function InvoiceScreen({ id }: { id: string }) {
  const query = useInvoice(id);
  const inv = query.data;
  const gstin = inv?.distributor.gstNumber ?? null;

  return (
    <>
      <div data-print-hide className="mb-4 flex items-center justify-between">
        <Link href="/invoices" className="text-sm text-text-muted hover:text-accent hover:underline">
          ← Invoices
        </Link>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!inv}
            onClick={() => {
              if (!inv) return;
              const t = invoiceLinesTable(inv, true);
              void downloadXlsx(invoiceFilename(inv.invoiceNumber), 'Invoice', t.header, t.rows);
            }}
          >
            Download Excel
          </Button>
          <Button
            variant="secondary"
            disabled={!inv}
            onClick={() => {
              if (!inv) return;
              const t = invoiceLinesTable(inv, false);
              downloadCsv(`${invoiceFilename(inv.invoiceNumber)}.csv`, toCsv(t.header, t.rows));
            }}
          >
            Download CSV
          </Button>
          <Button onClick={() => window.print()} disabled={!inv}>
            Print or save as PDF
          </Button>
        </div>
      </div>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!inv}
        empty={{ title: 'Invoice not found' }}
        skeleton={<Skeleton className="h-96 w-full max-w-4xl" />}
      >
        {inv ? (
          <article className="relative mx-auto max-w-4xl space-y-6 overflow-hidden rounded-lg border border-border bg-surface p-6 text-sm text-text sm:p-8 print:space-y-2 print:overflow-visible print:border-0 print:p-0 print:pt-2 print:text-[11px] print:leading-tight">
            <Image
              src="/brand/logo.png"
              alt=""
              width={702}
              height={523}
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 w-3/5 -translate-x-1/2 -translate-y-1/2 opacity-[0.07] print:w-2/5 print:opacity-[0.04] print:[print-color-adjust:exact]"
            />
            <header className="relative text-center sm:px-36 print:px-16 print:text-[10px] print:leading-snug">
              <Image
                src="/brand/logo.png"
                alt="Greynote Healthcare"
                width={702}
                height={523}
                priority
                className="mb-2 h-24 w-auto sm:absolute sm:left-0 sm:top-0 sm:mb-0 print:absolute print:left-0 print:top-0 print:mb-0 print:h-12"
              />
              <h1 className="text-xl font-bold print:text-sm">Tax Invoice</h1>
              <p className="mt-3 text-base font-bold print:mt-1 print:text-[12px]">{COMPANY.name}</p>
              {COMPANY.addressLines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <p>
                Phone no.: {COMPANY.phone} Email: {COMPANY.email}
              </p>
              <p>
                GSTIN: {COMPANY.gstin}, State: {COMPANY.state}
              </p>
            </header>

            <div className="relative grid gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-3">
              <section>
                <h2 className="font-semibold">Bill To</h2>
                <p className="font-medium">{inv.distributor.name}</p>
                {inv.distributor.address ? <p className="whitespace-pre-line">{inv.distributor.address}</p> : null}
                {inv.distributor.mobile ? <p>Contact No.: {inv.distributor.mobile}</p> : null}
                {gstin ? <p>GSTIN Number: {gstin}</p> : null}
              </section>
              <section className="sm:text-right print:text-right">
                <h2 className="font-semibold">Invoice Details</h2>
                <p>Invoice No.: {inv.invoiceNumber}</p>
                <p>Date: {formatDate(inv.invoiceDate)}</p>
                <p>Place of Supply: {COMPANY.state}</p>
              </section>
            </div>

            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm print:text-[10px] print:leading-tight">
                <thead className="table-header-group">
                  <tr>
                    <th className={TH}>#</th>
                    <th className={TH}>Item name</th>
                    <th className={TH}>HSN/SAC</th>
                    <th className={TH}>Batch No.</th>
                    <th className={TH}>Exp. Date</th>
                    <th className={`${TH} text-right`}>MRP</th>
                    <th className={`${TH} text-right`}>Quantity</th>
                    <th className={`${TH} text-right`}>Price/unit</th>
                    <th className={`${TH} text-right`}>GST</th>
                    <th className={`${TH} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l, at) => (
                    <tr key={`${l.sku}-${at}`} className="print:break-inside-avoid">
                      <td className={TD}>{at + 1}</td>
                      <td className={TD}>{l.productName}</td>
                      <td className={`${TD} tabular-nums`}>{l.hsn ?? '—'}</td>
                      <td className={TD}>{l.batchNo ?? '—'}</td>
                      <td className={`${TD} tabular-nums`}>{expiryLabel(l.expiry)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{l.mrpPaise === null ? '—' : formatMoney(l.mrpPaise)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {l.suppliedQty}
                        {l.freeQty > 0 ? ` + ${l.freeQty} free` : ''}
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{formatMoney(l.unitPricePaise)}</td>
                      <td className={`${TD} text-right tabular-nums`}>
                        {formatMoney(l.gstPaise)} ({l.gstPercent}%)
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{formatMoney(l.amountPaise + l.gstPaise)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className={TD} colSpan={6}>
                      Total
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{inv.lines.reduce((n, l) => n + l.suppliedQty, 0)}</td>
                    <td className={TD} />
                    <td className={`${TD} text-right tabular-nums`}>{formatMoney(inv.gstPaise)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{formatMoney(inv.taxablePaise + inv.gstPaise)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="relative grid gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-3 print:break-inside-avoid">
              <section>
                <h2 className="font-semibold">Invoice Amount In Words</h2>
                <p>{rupeesInWords(inv.totalPaise)}</p>
              </section>
              <section className="print:ml-auto print:w-full print:max-w-[60mm]">
                <h2 className="font-semibold">Amounts</h2>
                <Row label="Sub Total" value={formatMoney(inv.taxablePaise + inv.gstPaise)} />
                <Row label="Round off" value={formatMoney(inv.roundOffPaise)} />
                <Row label="Total" value={formatMoney(inv.totalPaise)} bold />
                <Row label="Received" value={formatMoney(inv.paidPaise)} />
                <Row label="Balance" value={formatMoney(inv.duePaise)} bold />
              </section>
            </div>

            <table className="relative w-full max-w-md border-collapse text-left text-sm print:break-inside-avoid print:text-[10px]">
              <thead>
                <tr>
                  <th className={TH}>Tax type</th>
                  <th className={`${TH} text-right`}>Taxable amount</th>
                  <th className={`${TH} text-right`}>Rate</th>
                  <th className={`${TH} text-right`}>Tax amount</th>
                </tr>
              </thead>
              <tbody>
                {taxBreakup(inv.lines, gstin).map((t) => (
                  <tr key={`${t.type}-${t.ratePercent}`}>
                    <td className={TD}>{t.type}</td>
                    <td className={`${TD} text-right tabular-nums`}>{formatMoney(t.taxablePaise)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{t.ratePercent}%</td>
                    <td className={`${TD} text-right tabular-nums`}>{formatMoney(t.taxPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className="relative break-inside-avoid pt-10 text-right print:pt-2">
              <p>For: {COMPANY.name}</p>
              <Image
                src="/brand/seal.png"
                alt="Company seal and signature"
                width={177}
                height={174}
                className="ml-auto mt-2 size-24 object-contain print:size-14 mix-blend-multiply print:[print-color-adjust:exact]"
              />
              <p className="mt-2">Authorized Signatory</p>
            </footer>
          </article>
        ) : null}
      </DataState>
    </>
  );
}
