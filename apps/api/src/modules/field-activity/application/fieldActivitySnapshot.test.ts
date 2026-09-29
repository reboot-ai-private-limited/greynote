import type { FieldActivitySnapshot } from '@greynote/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { faKit, Tx } from './usecases/faTestKit.js';
import { makeFieldActivitySource } from './fieldActivitySnapshot.js';
import { ListDoctorServicesUseCase, ListGiftsUseCase } from './usecases/servicesAndGifts.usecase.js';
import { DcrClock } from './dcrClock.js';

const DAY = '2026-10-05';
const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };
const digest = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex');

describe('what the phone caches of Field Activity', () => {
  let kit: ReturnType<typeof faKit>;
  const snapshot = (userId = 'mr1') => {
    const source = makeFieldActivitySource({
      clock: new DcrClock(kit.config, () => kit.clock.current),
      users: kit.users,
      summary: kit.dcrSummary,
      services: new ListDoctorServicesUseCase(kit.services, kit.approvals, kit.fmd),
      gifts: new ListGiftsUseCase(kit.gifts, kit.fmd),
    });
    return source.snapshot(userId) as Promise<FieldActivitySnapshot>;
  };

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
  });

  it('is named fieldActivity', () => {
    expect(makeFieldActivitySource({ clock: new DcrClock(kit.config), users: kit.users, summary: kit.dcrSummary, services: null as never, gifts: null as never }).name).toBe('fieldActivity');
  });

  it('an MR with nothing yet: not blocked, no reports, services or gifts', async () => {
    expect(await snapshot()).toEqual({ blocked: false, today: DAY, dcrs: [], doctorServices: [], pendingGifts: [] });
  });

  it('says when the MR is blocked', async () => {
    kit.users.users.get('mr1')!.blocked = true;
    expect((await snapshot()).blocked).toBe(true);
  });

  it('carries the week’s reports with status, counts and money; a day outside the week is left out', async () => {
    await kit.logExpense.execute(REC, { reportDate: DAY, type: 'MEAL', amountPaise: 5000, remarks: null }, new Tx());
    const { dcrId } = await kit.submit.execute('mr1', DAY, REC.recordedAt, new Tx());
    kit.dcrs.rows.push({ id: 'old', userId: 'mr1', reportDate: '2026-09-20', createdAt: new Date() });
    const s = await snapshot();
    expect(s.dcrs).toEqual([{ id: dcrId, reportDate: DAY, status: 'SUBMITTED', approvalRequestId: expect.any(String), doctorCalls: 0, chemistCalls: 0, followups: 0, taPaise: 0, daPaise: 0, otherExpensesPaise: 5000, paidPaise: 0 }]);
  });

  it('carries the MR’s Doctor Services with status, and only theirs', async () => {
    await kit.submitService.execute(REC, { doctorId: 'd1', serviceType: 'OTHERS', amountPaise: 100, remarks: 'x' }, new Tx());
    await kit.adminService.execute('admin', { doctorId: 'd1', serviceType: 'GIFT', amountPaise: 200, remarks: null });
    kit.services.rows.push({ ...kit.services.rows[0]!, id: 'not-mine', userId: 'mr2' });
    const s = await snapshot();
    expect(s.doctorServices.map((x) => [x.origin, x.status, x.amountPaise])).toEqual([['MR', 'SUBMITTED', 100], ['ADMIN', 'APPROVED', 200]]);
    expect(s.doctorServices[0]!.approvalRequestId).toEqual(expect.any(String));
  });

  it('carries only the pending gifts of the Doctors the MR has', async () => {
    const g = await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Lamp', amountPaise: 900 });
    await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Pen', amountPaise: 100 });
    await kit.markGiftDone.execute(REC, g.id, new Tx());
    expect((await snapshot()).pendingGifts.map((x) => x.productName)).toEqual(['Pen']);
    expect((await snapshot('mr2')).pendingGifts).toEqual([]);
  });

  it('is deterministic — the same data gives the same version — and changes when the data does', async () => {
    await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Lamp', amountPaise: 900 });
    const first = digest(await snapshot());
    expect(digest(await snapshot())).toBe(first);
    kit.clock.current = new Date(kit.clock.current.getTime() + 3_600_000); // an hour later, same day: nothing changes on its own
    expect(digest(await snapshot())).toBe(first);
    await kit.allocateGift.execute('admin', { doctorId: 'd1', productName: 'Pen', amountPaise: 100 });
    expect(digest(await snapshot())).not.toBe(first);
  });
});
