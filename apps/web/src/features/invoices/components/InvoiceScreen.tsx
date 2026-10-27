'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { useInvoice } from '../hooks/useInvoices';
import { COMPANY } from '../lib/company';
import { rupeesInWords, taxBreakup } from '../lib/invoices';

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-6 py-0.5 ${bold ? 'font-semibold' : ''}`}>
    <span>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

/**
 * One invoice laid out like the Tax Invoice the company issues today: seller block, bill-to, lines with GST, totals, amount in words and the tax
 * table. Rendered here from what the order holds and printed (or saved as PDF) from the browser; nothing is stored. HSN, batch and expiry are
 * not kept on orders, so those columns are left out.
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
        <Button onClick={() => window.print()} disabled={!inv}>
          Print or save as PDF
        </Button>
      </div>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!inv}
        empty={{ title: 'Invoice not found' }}
        skeleton={<Skeleton className="h-96 w-full max-w-4xl" />}
      >
        {inv ? (
          <article className="mx-auto max-w-4xl space-y-6 rounded-lg border border-border bg-surface p-6 text-sm text-text sm:p-8 print:border-0 print:p-0">
            <header className="text-center">
              <h1 className="text-xl font-bold">Tax Invoice</h1>
              <p className="mt-3 text-base font-bold">{COMPANY.name}</p>
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

            <div className="grid gap-6 sm:grid-cols-2">
              <section>
                <h2 className="font-semibold">Bill To</h2>
                <p className="font-medium">{inv.distributor.name}</p>
                {inv.distributor.address ? <p>{inv.distributor.address}</p> : null}
                {inv.distributor.mobile ? <p>Contact No.: {inv.distributor.mobile}</p> : null}
                {gstin ? <p>GSTIN Number: {gstin}</p> : null}
              </section>
              <section className="sm:text-right">
                <h2 className="font-semibold">Invoice Details</h2>
                <p>Invoice No.: {inv.invoiceNumber}</p>
                <p>Date: {formatDate(inv.invoiceDate)}</p>
                <p>Place of Supply: {COMPANY.state}</p>
              </section>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-y border-border-strong">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Item name</th>
                    <th className="px-2 py-2 text-right">MRP</th>
                    <th className="px-2 py-2 text-right">Quantity</th>
                    <th className="px-2 py-2 text-right">Price/unit</th>
                    <th className="px-2 py-2 text-right">GST</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l, at) => (
                    <tr key={`${l.sku}-${at}`} className="border-b border-border">
                      <td className="px-2 py-2">{at + 1}</td>
                      <td className="px-2 py-2">{l.productName}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{l.mrpPaise === null ? '—' : formatMoney(l.mrpPaise)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {l.suppliedQty}
                        {l.freeQty > 0 ? ` + ${l.freeQty} free` : ''}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatMoney(l.unitPricePaise)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatMoney(l.gstPaise)} ({l.gstPercent}%)
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatMoney(l.amountPaise + l.gstPaise)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="px-2 py-2" colSpan={3}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{inv.lines.reduce((n, l) => n + l.suppliedQty, 0)}</td>
                    <td />
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(inv.gstPaise)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(inv.taxablePaise + inv.gstPaise)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <section>
                <h2 className="font-semibold">Invoice Amount In Words</h2>
                <p>{rupeesInWords(inv.totalPaise)}</p>
              </section>
              <section>
                <h2 className="font-semibold">Amounts</h2>
                <Row label="Sub Total" value={formatMoney(inv.taxablePaise + inv.gstPaise)} />
                <Row label="Round off" value={formatMoney(inv.roundOffPaise)} />
                <Row label="Total" value={formatMoney(inv.totalPaise)} bold />
                <Row label="Received" value={formatMoney(inv.paidPaise)} />
                <Row label="Balance" value={formatMoney(inv.duePaise)} bold />
              </section>
            </div>

            <table className="w-full max-w-md border-collapse text-left">
              <thead>
                <tr className="border-y border-border-strong">
                  <th className="px-2 py-1">Tax type</th>
                  <th className="px-2 py-1 text-right">Taxable amount</th>
                  <th className="px-2 py-1 text-right">Rate</th>
                  <th className="px-2 py-1 text-right">Tax amount</th>
                </tr>
              </thead>
              <tbody>
                {taxBreakup(inv.lines, gstin).map((t) => (
                  <tr key={`${t.type}-${t.ratePercent}`} className="border-b border-border">
                    <td className="px-2 py-1">{t.type}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatMoney(t.taxablePaise)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{t.ratePercent}%</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatMoney(t.taxPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className="pt-10 text-right">
              <p>For: {COMPANY.name}</p>
              <p className="mt-12">Authorized Signatory</p>
            </footer>
          </article>
        ) : null}
      </DataState>
    </>
  );
}
