import type { InvoiceRowDto, InvoiceStatus } from '@greynote/contracts';
import { rupeesForCsv, toCsv } from '@/lib/csv';
import { SELLER_STATE_CODE } from './company';

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { UNPAID: 'Unpaid', PARTIAL: 'Part paid', PAID: 'Paid' };
export const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'danger' | 'warning' | 'success'> = { UNPAID: 'danger', PARTIAL: 'warning', PAID: 'success' };
export const INVOICE_STATUS_OPTIONS = [
  { value: 'all', label: 'Any status' },
  { value: 'UNPAID', label: INVOICE_STATUS_LABEL.UNPAID },
  { value: 'PARTIAL', label: INVOICE_STATUS_LABEL.PARTIAL },
  { value: 'PAID', label: INVOICE_STATUS_LABEL.PAID },
] as const;

export const statusOf = (v: string): InvoiceStatus | undefined => (v === 'UNPAID' || v === 'PARTIAL' || v === 'PAID' ? v : undefined);

/** First and last day of a `YYYY-MM` month, for the order-date range the list is asked for. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** What the filtered invoices add up to, for the tiles above the table. */
export function invoiceTotals(rows: readonly InvoiceRowDto[]): { totalPaise: number; paidPaise: number; duePaise: number } {
  return rows.reduce((t, r) => ({ totalPaise: t.totalPaise + r.totalPaise, paidPaise: t.paidPaise + r.paidPaise, duePaise: t.duePaise + r.duePaise }), { totalPaise: 0, paidPaise: 0, duePaise: 0 });
}

/** GST by rate for the tax table under the invoice: taxable amount and tax per rate. Within the seller's state the tax is split half SGST, half CGST; elsewhere it is all IGST. */
export interface TaxRow {
  type: 'SGST' | 'CGST' | 'IGST';
  taxablePaise: number;
  ratePercent: number;
  taxPaise: number;
}

export function taxBreakup(lines: ReadonlyArray<{ gstPercent: number; amountPaise: number; gstPaise: number }>, buyerGstin: string | null): TaxRow[] {
  const byRate = new Map<number, { taxablePaise: number; taxPaise: number }>();
  for (const l of lines) {
    if (l.gstPercent === 0) continue;
    const cur = byRate.get(l.gstPercent) ?? { taxablePaise: 0, taxPaise: 0 };
    byRate.set(l.gstPercent, { taxablePaise: cur.taxablePaise + l.amountPaise, taxPaise: cur.taxPaise + l.gstPaise });
  }
  const inState = buyerGstin !== null && buyerGstin.slice(0, 2) === SELLER_STATE_CODE;
  return [...byRate].flatMap(([rate, t]): TaxRow[] =>
    inState
      ? [
          { type: 'SGST', taxablePaise: t.taxablePaise, ratePercent: rate / 2, taxPaise: Math.floor(t.taxPaise / 2) },
          { type: 'CGST', taxablePaise: t.taxablePaise, ratePercent: rate / 2, taxPaise: t.taxPaise - Math.floor(t.taxPaise / 2) },
        ]
      : [{ type: 'IGST', taxablePaise: t.taxablePaise, ratePercent: rate, taxPaise: t.taxPaise }],
  );
}

export const INVOICES_CSV_HEADER = ['Invoice no.', 'Date', 'Distributor', 'Total (INR)', 'Paid (INR)', 'Due (INR)', 'Status'] as const;

export const invoicesCsv = (rows: readonly InvoiceRowDto[]): string =>
  toCsv(
    INVOICES_CSV_HEADER,
    rows.map((r) => [r.invoiceNumber, r.invoiceDate, r.distributor.name, rupeesForCsv(r.totalPaise), rupeesForCsv(r.paidPaise), rupeesForCsv(r.duePaise), INVOICE_STATUS_LABEL[r.status]]),
  );

/** An expiry kept as `YYYY-MM`, printed `MM/YYYY`; a dash when the invoice has none (older invoices). */
export const expiryLabel = (expiry: string | null): string => {
  const m = expiry === null ? null : /^(\d{4})-(\d{2})$/.exec(expiry);
  return m ? `${m[2]}/${m[1]}` : '—';
};

export const invoicesFilename = (month: string): string => `invoices-${month}.csv`;

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tail = rest < 20 ? ONES[rest]! : `${TENS[Math.floor(rest / 10)]!}${rest % 10 ? ` ${ONES[rest % 10]!}` : ''}`;
  return [hundreds ? `${ONES[hundreds]!} Hundred` : '', tail].filter(Boolean).join(' and ');
}

/** A whole-rupee amount in words the Indian way (crore, lakh, thousand), as printed under "Invoice Amount In Words": `Twenty Five Thousand Nine Hundred and Six Rupees only`. */
export function rupeesInWords(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees === 0) return 'Zero Rupees only';
  const parts: string[] = [];
  let left = rupees;
  for (const [size, name] of [[10_000_000, 'Crore'], [100_000, 'Lakh'], [1_000, 'Thousand']] as const) {
    const q = Math.floor(left / size);
    if (q) parts.push(`${rupeesChunk(q)} ${name}`);
    left %= size;
  }
  if (left) parts.push(belowThousand(left));
  return `${parts.join(' ')} Rupees only`;
}

/** A crore or lakh count can itself pass 99 (crores), so it is spelled with the same rules. */
function rupeesChunk(n: number): string {
  return n >= 1000 ? `${belowThousand(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${belowThousand(n % 1000)}` : ''}` : belowThousand(n);
}

/** The invoices whose number or distributor contains `term` (any case); all of them when it is blank. */
export const searchInvoices = (rows: readonly InvoiceRowDto[], term: string): InvoiceRowDto[] => {
  const q = term.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => r.invoiceNumber.toLowerCase().includes(q) || r.distributor.name.toLowerCase().includes(q));
};
