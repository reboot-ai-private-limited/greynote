import type { ReportOrderRowDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { ORDERS_CSV_HEADER, canFinish, ordersCsv, ordersFilename, tabOf } from './orders';

const row = (over: Partial<ReportOrderRowDto> = {}): ReportOrderRowDto => ({
  id: 'o1',
  orderDate: '2026-10-05',
  status: 'PLACED',
  outletType: 'DISTRIBUTOR',
  outlet: { id: 'd1', name: 'Shree, Distributors' },
  mr: { id: 'u1', name: 'Asha Rao', employeeCode: 'MR001' },
  itemCount: 3,
  totalAmountPaise: 123_450,
  completedAt: null,
  remarks: null,
  ...over,
});

describe('canFinish', () => {
  it('only a placed order to a distributor can be marked Done or Cancelled from here', () => {
    expect(canFinish(row())).toBe(true);
    expect(canFinish(row({ status: 'DONE' }))).toBe(false);
    expect(canFinish(row({ status: 'CANCELLED' }))).toBe(false);
    expect(canFinish(row({ outletType: 'CHEMIST' }))).toBe(false);
  });
});

describe('tabOf', () => {
  it('reads the chemist tab, and anything else is the distributors', () => {
    expect(tabOf('CHEMIST')).toBe('CHEMIST');
    expect(tabOf('')).toBe('DISTRIBUTOR');
    expect(tabOf('x')).toBe('DISTRIBUTOR');
  });
});

describe('ordersCsv', () => {
  it('writes a row per order with plain-number rupees, quoting what needs it', () => {
    const lines = ordersCsv({ rows: [row(), row({ id: 'o2', status: 'DONE', completedAt: '2026-10-09T05:00:00.000Z', outletType: 'CHEMIST', outlet: { id: 'c1', name: 'Sai Medical' } })] }).trimEnd().split('\r\n');
    expect(lines[0]).toBe(ORDERS_CSV_HEADER.join(','));
    expect(lines[1]).toBe('2026-10-05,Distributor,"Shree, Distributors",MR001,Asha Rao,3,1234.50,Placed,');
    expect(lines[2]).toBe('2026-10-05,Chemist,Sai Medical,MR001,Asha Rao,3,1234.50,Done,2026-10-09');
  });
  it('names the file by its month and kind', () => {
    expect(ordersFilename('2026-10', 'DISTRIBUTOR')).toBe('orders-distributors-2026-10.csv');
    expect(ordersFilename('2026-10', 'CHEMIST')).toBe('orders-chemists-2026-10.csv');
  });
});
