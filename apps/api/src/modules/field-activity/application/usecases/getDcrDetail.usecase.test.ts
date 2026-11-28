import { describe, expect, it } from 'vitest';
import { GetDcrDetailUseCase } from './getDcrDetail.usecase.js';

const MR = 'mr-1';
const DAY = '2026-11-28';
const at = (date: string) => new Date(`${date}T06:00:00Z`);
const empty = { listForDcr: async () => [] };
const master = {
  getDoctor: async (id: string) => ({ name: `Dr ${id}` }),
  getChemist: async (id: string) => ({ name: `Chemist ${id}` }),
  getDistributor: async (id: string) => ({ name: `Distributor ${id}` }),
  getProduct: async (id: string) => ({ name: `Product ${id}` }),
};

/** A detail reader over one MR's day, with records on that day, the day before, and someone else's. */
function reader() {
  const base = { execute: async () => ({ id: 'dcr-1', userId: MR, reportDate: DAY, status: 'APPROVED' }) };
  const services = {
    list: async (f: { userId?: string }) =>
      [
        { id: 's1', userId: MR, doctorId: 'd1', serviceType: 'CME', amountPaise: 500000, remarks: 'Slot in Dec', createdAt: at(DAY), doneAt: null },
        { id: 's2', userId: MR, doctorId: 'd1', serviceType: 'CME', amountPaise: 1, remarks: null, createdAt: at('2026-11-27'), doneAt: null },
      ].filter((s) => s.userId === f.userId),
  };
  const gifts = {
    list: async (f: { involving?: string }) =>
      [
        { id: 'g1', doctorId: 'd2', productName: 'Diary 2027', amountPaise: 35000, status: 'REQUESTED', requestedBy: MR, requestNote: 'New year', completedBy: null, completedAt: null, requestedAt: at(DAY) },
        { id: 'g2', doctorId: 'd3', productName: 'Pen set', amountPaise: 20000, status: 'DONE', requestedBy: null, requestNote: null, completedBy: MR, completedAt: at(DAY), requestedAt: at('2026-11-01') },
        { id: 'g3', doctorId: 'd3', productName: 'Bag', amountPaise: 1, status: 'DONE', requestedBy: null, requestNote: null, completedBy: 'someone-else', completedAt: at(DAY), requestedAt: at(DAY) },
      ].filter((g) => g.requestedBy === f.involving || g.completedBy === f.involving),
  };
  const sampleRequests = {
    list: async (f: { userId?: string }) =>
      [
        { id: 'r1', userId: MR, kind: 'LBL', status: 'REQUESTED', remarks: null, lines: [{ productId: 'p1', quantity: 5, creditedQuantity: null }], requestedAt: at(DAY) },
        { id: 'r2', userId: MR, kind: 'SAMPLE', status: 'DONE', remarks: null, lines: [], requestedAt: at('2026-11-20') },
      ].filter((r) => r.userId === f.userId),
  };
  const approvals = { listForRecords: async (_k: string, ids: string[]) => ids.map((recordId) => ({ recordId, status: 'MANAGER_APPROVED' })) };
  const clock = { dateConverter: async () => (d: Date) => d.toISOString().slice(0, 10) };
  const use = new GetDcrDetailUseCase(base as never, empty as never, empty as never, empty as never, empty as never, master as never, { services, gifts, sampleRequests, approvals, clock } as never);
  use.bindOrders(async (userId, date) =>
    userId === MR && date === DAY ? [{ id: 'o1', outlet: { type: 'DISTRIBUTOR', id: 'x1' }, status: 'PLACED', totalAmountPaise: 120000, remarks: null, items: [{ productId: 'p2', quantity: 10, amountPaise: 120000 }] }] : [],
  );
  return use;
}

describe('a daily report carries the rest of the day (2026-11-28)', () => {
  it('lists the day’s orders, gifts given and asked for, services and sample/LBL requests — and only that day’s, only theirs', async () => {
    const d = await reader().execute({ id: 'mgr', role: 'FIELD' } as never, 'dcr-1');
    expect(d.orders).toEqual([{ id: 'o1', outletType: 'DISTRIBUTOR', outletName: 'Distributor x1', status: 'PLACED', totalAmountPaise: 120000, remarks: null, items: [{ productName: 'Product p2', quantity: 10, amountPaise: 120000 }] }]);
    expect(d.giftsGiven).toEqual([{ id: 'g2', doctorName: 'Dr d3', productName: 'Pen set', amountPaise: 20000 }]);
    expect(d.giftRequests).toEqual([{ id: 'g1', doctorName: 'Dr d2', productName: 'Diary 2027', amountPaise: 35000, status: 'REQUESTED', note: 'New year' }]);
    expect(d.services).toEqual([{ id: 's1', doctorName: 'Dr d1', serviceType: 'CME', amountPaise: 500000, remarks: 'Slot in Dec', status: 'MANAGER_APPROVED' }]);
    expect(d.sampleRequests).toEqual([{ id: 'r1', kind: 'LBL', status: 'REQUESTED', remarks: null, lines: [{ productName: 'Product p1', quantity: 5 }] }]);
  });

  it('is empty, not missing, when nothing else was done', async () => {
    const use = new GetDcrDetailUseCase({ execute: async () => ({ id: 'dcr-1', userId: 'mr-2', reportDate: DAY }) } as never, empty as never, empty as never, empty as never, empty as never, master as never);
    expect(await use.execute({ id: 'mr-2', role: 'FIELD' } as never, 'dcr-1')).toMatchObject({ orders: [], giftsGiven: [], giftRequests: [], services: [], sampleRequests: [] });
  });
});
