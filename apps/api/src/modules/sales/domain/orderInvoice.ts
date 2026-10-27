import type { Paise } from '@/shared/money/paise.js';
import type { OrderInvoice } from './order.entity.js';

const PAISE_PER_RUPEE = 100;

/**
 * The GST invoice for what was supplied. Order prices are ex-GST, so each line's tax is its supplied net × its product's GST rate, rounded to the paise;
 * the total is rounded to the nearest rupee, the difference kept as the round-off (as on the printed Tax Invoice). A product with no GST rate on file is taxed 0%.
 */
export function buildInvoice(lines: ReadonlyArray<{ suppliedNetPaise: Paise; gstPercent: number | null }>): OrderInvoice {
  const taxLines = lines.map((l) => {
    const gstPercent = l.gstPercent ?? 0;
    return { gstPercent, gstPaise: Math.round((l.suppliedNetPaise * gstPercent) / 100) };
  });
  const taxablePaise = lines.reduce((n, l) => n + l.suppliedNetPaise, 0);
  const gstPaise = taxLines.reduce((n, l) => n + l.gstPaise, 0);
  const exact = taxablePaise + gstPaise;
  const totalPaise = Math.round(exact / PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
  return { taxablePaise, lines: taxLines, gstPaise, roundOffPaise: totalPaise - exact, totalPaise };
}

/** What a Done order is owed: its frozen invoice total, or what was supplied for one from before invoices. */
export function owedOf(order: { invoice?: OrderInvoice | null; suppliedAmountPaise?: Paise | null; totalAmountPaise: Paise }): Paise {
  return order.invoice?.totalPaise ?? order.suppliedAmountPaise ?? order.totalAmountPaise;
}
