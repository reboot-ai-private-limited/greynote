import type { SalesMonthDto, SalesStatementDto, StockReportDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { monthNote, salesFilename, salesMonthsCsv, statementCsv, stockCsv } from './sales';

const m = (over: Partial<SalesMonthDto> = {}): SalesMonthDto => ({ month: '2026-04', state: 'ENDED', primaryQty: 150, primaryPaise: 170_000, placedQty: 0, placedPaise: 0, secondaryQty: 120, secondaryPaise: 150_000, countedDistributors: 3, expectedDistributors: 3, complete: true, negativeRows: 0, unpricedRows: 0, ...over });

describe('monthNote', () => {
  it('says why a month has no secondary, and how complete it is when it has', () => {
    expect(monthNote(m({ state: 'FUTURE' }))).toMatch(/Not started/);
    expect(monthNote(m({ state: 'OPEN', secondaryQty: null }))).toMatch(/stock is counted after the month ends/);
    expect(monthNote(m({ secondaryQty: null, secondaryPaise: null, countedDistributors: 0, complete: false }))).toMatch(/No stock count or statement was entered/);
    expect(monthNote(m({ state: 'OPEN', secondaryQty: 30 }))).toMatch(/only what has been counted or stated so far/);
    expect(monthNote(m())).toBe('All 3 distributors counted.');
    expect(monthNote(m({ countedDistributors: 2, complete: false }))).toMatch(/2 of 3 distributors counted: the secondary is only part of the picture/);
    expect(monthNote(m({ negativeRows: 2, unpricedRows: 1 }))).toMatch(/2 counts came out below zero and are left out\. 1 count of a product with no PTS is left out/);
  });
});

describe('the CSVs', () => {
  it('the year: a row per month that has started, with gaps left empty and rupees as plain numbers', () => {
    const lines = salesMonthsCsv({ months: [m(), m({ month: '2026-05', secondaryQty: null, secondaryPaise: null, complete: false, countedDistributors: 0 }), m({ month: '2026-06', state: 'FUTURE' })] }).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('Apr 26,150,1700.00,0.00,120,1500.00,3,3,Yes');
    expect(lines[2]).toBe('May 26,150,1700.00,0.00,,,0,3,No');
  });

  it('the statement: gaps empty, notes spelled out', () => {
    const s: Pick<SalesStatementDto, 'rows'> = {
      rows: [
        { distributor: { id: 'd1', name: 'Shree, Ltd' }, product: { id: 'p1', name: 'XYZ-500', sku: 'XYZ' }, openingQty: 40, primaryQty: 100, orderPrimaryQty: 100, adjustmentQty: 0, primaryPaise: 80_000, placedQty: 7, closingQty: 50, secondaryQty: 90, secondaryPaise: 90_000, source: 'FIELD_COUNT', flags: ['OPENING_MISMATCH'] },
        { distributor: { id: 'd2', name: 'Maa Tara' }, product: { id: 'p2', name: 'Cet', sku: 'C' }, openingQty: null, primaryQty: 10, orderPrimaryQty: 10, adjustmentQty: 0, primaryPaise: 18_000, placedQty: 0, closingQty: null, secondaryQty: null, secondaryPaise: null, source: 'NONE', flags: ['NO_COUNT'] },
      ],
    };
    const lines = statementCsv(s).trimEnd().split('\r\n');
    expect(lines[1]).toBe('"Shree, Ltd",XYZ-500,XYZ,40,100,0,100,800.00,7,50,90,900.00,Field count,Opening ≠ last closing');
    expect(lines[2]).toBe('Maa Tara,Cet,C,,10,0,10,180.00,0,,,,,No count');
  });

  it('the stock report, and the sales file named by its financial year', () => {
    const r: Pick<StockReportDto, 'rows'> = { rows: [{ outletType: 'CHEMIST', outlet: { id: 'c1', name: 'Sai' }, product: null, openingQty: null, previousClosingQty: null, closingQty: null, flags: ['NO_COUNT'] }] };
    expect(stockCsv(r).trimEnd().split('\r\n')[1]).toBe('Chemist,Sai,,,,,,No count');
    expect(salesFilename(2026)).toBe('sales-2026-27.csv');
    expect(salesFilename(2099)).toBe('sales-2099-00.csv');
  });
});
