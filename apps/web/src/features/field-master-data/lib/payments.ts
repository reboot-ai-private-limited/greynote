import type { PaymentMode, RecordDistributorPaymentDto } from '@greynote/contracts';
import { isRealDate } from '@/lib/dateRange';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { rupeesToPaise } from '@/lib/money';

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
}

export const emptyPayment = (today: string): PaymentDraft => ({
  paymentDate: today,
  amount: '',
  mode: '',
  reference: '',
  note: '',
});

/** Builds the body for one payment, or says what is wrong with each field. `today` is the business date: a payment cannot be dated after it. */
export function buildPayment(
  distributorId: string,
  draft: PaymentDraft,
  today: string,
): BuildResult<RecordDistributorPaymentDto> {
  const amount = rupeesToPaise(draft.amount);
  const reference = squash(draft.reference);
  const note = squash(draft.note);
  const errors: Record<string, string | undefined> = {
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
