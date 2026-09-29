import { beforeEach, describe, expect, it } from 'vitest';
import { faKit, Tx } from './faTestKit.js';

const DAY = '2026-10-05';
const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };

describe('TA/DA over a DCR’s life', () => {
  let kit: ReturnType<typeof faKit>;
  let dcrId: string;
  const auto = () => kit.expenses.rows.filter((r) => r.source === 'AUTO');

  beforeEach(async () => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-1'] });
    dcrId = (await kit.submit.execute('mr1', DAY, REC.recordedAt, new Tx())).dcrId;
  });

  it('nothing exists at submit; at the manager’s approval the server writes TA (per Route) and DA, UNPAID', async () => {
    expect(auto()).toHaveLength(0);
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto()).toEqual([expect.objectContaining({ type: 'TA', routeId: 'route-1', amountPaise: 8003, paymentStatus: 'UNPAID', source: 'AUTO', dcrId, userId: 'mr1', reportDate: DAY, clientId: null, distanceFlag: false })]);
    // the HQ rate is ₹0, so no DA row for an HQ-only day
  });

  it('a route in another Area type earns the higher DA', async () => {
    kit.territory.routes.set('route-1', { ...kit.territory.routes.get('route-1')!, areaType: 'OUT_STATION' });
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto().map((r) => [r.type, r.amountPaise])).toEqual([['TA', 8003], ['DA', 50000]]);
  });

  it('exactly once: the same approval seen again, or MANAGER_APPROVED then APPROVED, adds nothing', async () => {
    kit.territory.routes.set('route-1', { ...kit.territory.routes.get('route-1')!, areaType: 'EX_STATION' });
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    await kit.taDa.onStatusChange(dcrId, 'APPROVED', new Tx());
    expect(auto()).toHaveLength(2);
  });

  it('a submitter with no manager (straight to APPROVED) gets it too', async () => {
    await kit.taDa.onStatusChange(dcrId, 'APPROVED', new Tx());
    expect(auto()).toHaveLength(1);
  });

  it('Admin’s final rejection cancels the UNPAID AUTO rows; MANUAL rows stay; a later approval writes fresh ones', async () => {
    kit.approvals.setStatus(dcrId, 'REJECTED'); // open for logging again, as after a rejection
    await kit.logExpense.execute(REC, { reportDate: DAY, type: 'MEAL', amountPaise: 5000, remarks: null }, new Tx());
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    await kit.taDa.onStatusChange(dcrId, 'REJECTED', new Tx());
    expect(auto().map((r) => r.paymentStatus)).toEqual(['CANCELLED']);
    expect(kit.expenses.rows.find((r) => r.source === 'MANUAL')!.paymentStatus).toBe('UNPAID');
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto().map((r) => r.paymentStatus)).toEqual(['CANCELLED', 'UNPAID']);
  });

  it('a PAID row is left alone by a rejection, and is not generated a second time', async () => {
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    auto()[0]!.paymentStatus = 'PAID';
    await kit.taDa.onStatusChange(dcrId, 'REOPENED', new Tx());
    expect(auto().map((r) => r.paymentStatus)).toEqual(['PAID']);
    await kit.taDa.onStatusChange(dcrId, 'APPROVED', new Tx());
    expect(auto()).toHaveLength(1);
  });

  it('a manager rejection (before anything was generated) and a withdrawal do no harm', async () => {
    await kit.taDa.onStatusChange(dcrId, 'REJECTED', new Tx());
    await kit.taDa.onStatusChange(dcrId, 'WITHDRAWN', new Tx());
    expect(auto()).toHaveLength(0);
  });

  it('no Plan for the day → no rows (a gap for the audit), no failure; a STRIKE day → none', async () => {
    kit.planning.days.clear();
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto()).toHaveLength(0);
    kit.planning.days.set(`mr1:${DAY}`, { workingType: 'STRIKE', routeIds: [] });
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto()).toHaveLength(0);
  });

  it('a Route with no calculated distance is a flagged zero row, and approval still goes through', async () => {
    kit.territory.routes.set('route-1', { ...kit.territory.routes.get('route-1')!, distanceStatus: 'FAILED', distanceKm: null });
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto()).toEqual([expect.objectContaining({ type: 'TA', amountPaise: 0, distanceFlag: true })]);
  });

  it('what the phone sent never matters: an amount can only come from the calculation', async () => {
    kit.approvals.setStatus(dcrId, 'REJECTED');
    await kit.logExpense.execute(REC, { reportDate: DAY, type: 'TRAVEL', amountPaise: 999999, remarks: null }, new Tx());
    await kit.taDa.onStatusChange(dcrId, 'MANAGER_APPROVED', new Tx());
    expect(auto().every((r) => r.amountPaise !== 999999)).toBe(true);
  });
});
