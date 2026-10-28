import type { InvoiceRowDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { expiryLabel, invoiceTotals, invoicesCsv, monthBounds, rupeesInWords, searchInvoices, statusOf, taxBreakup } from './invoices';

const row = (over: Partial<InvoiceRowDto> = {}): InvoiceRowDto => ({
  orderId: 'o1',
  invoiceNumber: '3452',
  invoiceDate: '2026-10-26',
  distributor: { id: 'd1', name: 'UMA MEDICAL STORE' },
  totalPaise: 25_906_00,
  paidPaise: 0,
  duePaise: 25_906_00,
  status: 'UNPAID',
  ...over,
});

describe('rupeesInWords', () => {
  it('reads the sample Tax Invoice total the way it is printed', () => {
    expect(rupeesInWords(25_906_00)).toBe('Twenty Five Thousand Nine Hundred and Six Rupees only');
  });
  it('uses lakh and crore, and handles round figures and zero', () => {
    expect(rupeesInWords(1_00)).toBe('One Rupees only');
    expect(rupeesInWords(1_00_000_00)).toBe('One Lakh Rupees only');
    expect(rupeesInWords(12_34_567_00)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven Rupees only');
    expect(rupeesInWords(2_50_00_000_00)).toBe('Two Crore Fifty Lakh Rupees only');
    expect(rupeesInWords(100_00)).toBe('One Hundred Rupees only');
    expect(rupeesInWords(0)).toBe('Zero Rupees only');
  });
});

describe('taxBreakup', () => {
  const lines = [
    { gstPercent: 5, amountPaise: 24_672_00, gstPaise: 1_233_60 },
    { gstPercent: 0, amountPaise: 1_000_00, gstPaise: 0 },
  ];
  it('splits within West Bengal into SGST and CGST at half the rate, as the sample invoice shows', () => {
    expect(taxBreakup(lines, '19AKPPM9555K1Z5')).toEqual([
      { type: 'SGST', taxablePaise: 24_672_00, ratePercent: 2.5, taxPaise: 616_80 },
      { type: 'CGST', taxablePaise: 24_672_00, ratePercent: 2.5, taxPaise: 616_80 },
    ]);
  });
  it('is all IGST for a buyer in another state, or with no GSTIN on file', () => {
    expect(taxBreakup(lines, '27AAAAA0000A1Z5')).toEqual([{ type: 'IGST', taxablePaise: 24_672_00, ratePercent: 5, taxPaise: 1_233_60 }]);
    expect(taxBreakup(lines, null)).toHaveLength(1);
    expect(taxBreakup([], '19AKPPM9555K1Z5')).toEqual([]);
  });
  it('keeps an odd paisa on the CGST side so the two halves add up to the tax', () => {
    const [sgst, cgst] = taxBreakup([{ gstPercent: 5, amountPaise: 1, gstPaise: 5 }], '19X');
    expect((sgst?.taxPaise ?? 0) + (cgst?.taxPaise ?? 0)).toBe(5);
  });
});

describe('invoice list helpers', () => {
  it('bounds a month, leap February included', () => {
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('adds up total, paid and due', () => {
    expect(invoiceTotals([row(), row({ totalPaise: 10_000, paidPaise: 4_000, duePaise: 6_000, status: 'PARTIAL' })])).toEqual({ totalPaise: 25_906_00 + 10_000, paidPaise: 4_000, duePaise: 25_906_00 + 6_000 });
  });
  it('reads only the three statuses', () => {
    expect(statusOf('PAID')).toBe('PAID');
    expect(statusOf('all')).toBeUndefined();
  });
  it('writes the CSV with plain rupee figures', () => {
    expect(invoicesCsv([row({ paidPaise: 5_00, duePaise: 25_901_00, status: 'PARTIAL' })])).toBe('Invoice no.,Date,Distributor,Total (INR),Paid (INR),Due (INR),Status\r\n3452,2026-10-26,UMA MEDICAL STORE,25906.00,5.00,25901.00,Part paid\r\n');
  });
});

describe('expiryLabel', () => {
  it('prints YYYY-MM as MM/YYYY, and a dash for an invoice from before expiry was kept', () => {
    expect(expiryLabel('2028-03')).toBe('03/2028');
    expect(expiryLabel(null)).toBe('—');
    expect(expiryLabel('bad')).toBe('—');
  });
});

describe('searchInvoices', () => {
  const rows = [row(), row({ orderId: 'o2', invoiceNumber: '3453', distributor: { id: 'd2', name: 'H.S MED DISTRIBUTORS' } })];
  it('matches invoice number or distributor in any case', () => {
    expect(searchInvoices(rows, '3453').map((r) => r.orderId)).toEqual(['o2']);
    expect(searchInvoices(rows, 'uma').map((r) => r.orderId)).toEqual(['o1']);
  });
  it('returns everything for a blank term', () => {
    expect(searchInvoices(rows, '')).toHaveLength(2);
  });
});
