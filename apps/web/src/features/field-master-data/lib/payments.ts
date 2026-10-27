import type { InvoiceRowDto, PaymentMode, RecordDistributorPaymentDto } from '@greynote/contracts';
import { isRealDate } from '@/lib/dateRange';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

export const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
};
export const MODE_OPTIONS = (Object.keys(MODE_LABEL) as PaymentMode[]).map((value) => ({
  value,
  label: MODE_LABEL[value],
}));
export const REFERENCE_MAX = 100;
export const NOTE_MAX = 500;

export interface PaymentDraft {
  paymentDate: string;
  amount: string;
  mode: PaymentMode | '';
  reference: string;
  note: string;
  /** Rupees typed against each invoice (by order id); empty or absent = none. */
  allocations: Record<string, string>;
}

export const emptyPayment = (today: string): PaymentDraft => ({
  paymentDate: today,
  amount: '',
  mode: '',
  reference: '',
  note: '',
  allocations: {},
});

/** The invoices that still have something due, oldest first: the order a payment is spread over. */
export const openInvoices = (invoices: readonly InvoiceRowDto[]): InvoiceRowDto[] =>
  invoices
    .filter((i) => i.duePaise > 0)
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true }));

/** Spreads the amount over the open invoices, oldest first, each up to what is due on it; whatever is left over stays on account. */
export function autoAllocate(amountPaise: number, invoices: readonly InvoiceRowDto[]): Record<string, string> {
  const out: Record<string, string> = {};
  let left = amountPaise;
  for (const i of openInvoices(invoices)) {
    if (left <= 0) break;
    const take = Math.min(left, i.duePaise);
    out[i.orderId] = paiseToRupees(take);
    left -= take;
  }
  return out;
}

/** What the typed invoice amounts add up to; an entry that is not a valid amount counts as nothing. */
export const allocatedPaise = (allocations: Record<string, string>): number =>
  Object.values(allocations).reduce((n, v) => n + (rupeesToPaise(v) ?? 0), 0);

/** Builds the body for one payment, or says what is wrong with each field. `today` is the business date: a payment cannot be dated after it. `invoices` are the distributor's, for the amounts typed against them. */
export function buildPayment(
  distributorId: string,
  draft: PaymentDraft,
  today: string,
  invoices: readonly InvoiceRowDto[] = [],
): BuildResult<RecordDistributorPaymentDto> {
  const amount = rupeesToPaise(draft.amount);
  const reference = squash(draft.reference);
  const note = squash(draft.note);
  const allocations: NonNullable<RecordDistributorPaymentDto['allocations']> = [];
  let allocationError: string | undefined;
  for (const [orderId, typed] of Object.entries(draft.allocations)) {
    if (typed.trim() === '') continue;
    const invoice = invoices.find((i) => i.orderId === orderId);
    const paise = rupeesToPaise(typed);
    if (!invoice) continue;
    if (paise === null || paise <= 0) allocationError ??= `Invoice ${invoice.invoiceNumber}: enter an amount in rupees, more than zero.`;
    else if (paise > invoice.duePaise) allocationError ??= `Invoice ${invoice.invoiceNumber}: only ${paiseToRupees(invoice.duePaise)} is due.`;
    else allocations.push({ orderId, amountPaise: paise });
  }
  if (!allocationError && amount !== null && allocations.reduce((n, a) => n + a.amountPaise, 0) > amount) allocationError = 'The invoice amounts add up to more than the payment.';
  const errors: Record<string, string | undefined> = {
    allocations: allocationError,
    paymentDate: !isRealDate(draft.paymentDate)
      ? 'Choose the date it was received.'
      : draft.paymentDate > today
        ? 'A payment cannot be dated in the future.'
        : undefined,
    amount:
      amount === null || amount <= 0 ? 'Enter an amount in rupees, more than zero.' : undefined,
    mode: draft.mode === '' ? 'Choose how it was paid.' : undefined,
    reference:
      reference.length > REFERENCE_MAX ? `Keep it to ${REFERENCE_MAX} characters.` : undefined,
    note: note.length > NOTE_MAX ? `Keep it to ${NOTE_MAX} characters.` : undefined,
  };
  if (Object.values(errors).some(Boolean) || amount === null || draft.mode === '')
    return fail(errors);
  return {
    ok: true,
    body: {
      distributorId,
      paymentDate: draft.paymentDate,
      amountPaise: amount,
      mode: draft.mode,
      reference: reference || null,
      note: note || null,
      ...(allocations.length > 0 && { allocations }),
    },
  };
}

export type PaymentRange = 'month' | 'year' | 'custom';
export const PAYMENT_RANGE_OPTIONS = [
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'Financial year' },
  { value: 'custom', label: 'Custom' },
] as const;

/** The days a preset covers, always ending today (or at the year's end when a past year is in view). `fy` is the year's own first and last day. */
export function paymentRange(
  preset: Exclude<PaymentRange, 'custom'>,
  today: string,
  fy: { from: string; to: string },
): { from: string; to: string } {
  const to = today < fy.to && today >= fy.from ? today : fy.to;
  return preset === 'year'
    ? { from: fy.from, to }
    : { from: `${to.slice(0, 7)}-01` < fy.from ? fy.from : `${to.slice(0, 7)}-01`, to };
}

/** The share of what was ordered that has been collected, as a whole percent; null when nothing was ordered. */
export function collectedPercent(collectedPaise: number, orderedPaise: number): number | null {
  return orderedPaise > 0 ? Math.round((collectedPaise / orderedPaise) * 100) : null;
}
