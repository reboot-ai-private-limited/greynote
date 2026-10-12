import { beforeEach, describe, expect, it } from 'vitest';
import { GateRefusal } from '../../domain/gateRefusal.js';
import { HasQualifyingDcrUseCase } from './hasQualifyingDcr.usecase.js';
import { faKit } from './faTestKit.js';

const DAY = '2026-10-05';
const AT = new Date('2026-10-05T04:00:00Z'); // 09:30 IST on DAY

async function refusal(p: Promise<unknown>): Promise<GateRefusal> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GateRefusal);
  return err as GateRefusal;
}

describe('the logging gate', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
  });

  it('lets an unblocked MR log on a day whose Plan is approved, and creates the day’s DCR on the first record', async () => {
    const dcr = await kit.gate.open('mr1', DAY, AT);
    expect(dcr).toMatchObject({ userId: 'mr1', reportDate: DAY });
    expect((await kit.gate.open('mr1', DAY, AT)).id).toBe(dcr.id); // the same envelope every time
    expect(kit.dcrs.rows).toHaveLength(1);
  });

  it('refuses a blocked employee first, whatever else is true', async () => {
    kit.users.users.get('mr1')!.blocked = true;
    expect((await refusal(kit.gate.open('mr1', '2030-01-01', AT))).code).toBe('USER_BLOCKED');
    expect(kit.dcrs.rows).toHaveLength(0);
  });

  it('refuses a day in the future, and a record filed under a day other than the one it was made', async () => {
    kit.planning.approve('mr1', '2026-10-06');
    expect((await refusal(kit.gate.open('mr1', '2026-10-06', AT))).code).toBe('DATE_IN_FUTURE');
    kit.planning.approve('mr1', '2026-10-04');
    expect((await refusal(kit.gate.open('mr1', '2026-10-04', AT))).code).toBe('DATE_MISMATCH'); // made on the 5th, filed under the 4th
  });

  it('judges the day in the business timezone: 00:30 IST on the 6th is the 6th, though it is still the 5th in UTC', async () => {
    kit.clock.current = new Date('2026-10-05T19:30:00Z'); // 01:00 IST on the 6th
    kit.planning.approve('mr1', '2026-10-06');
    const madeAt = new Date('2026-10-05T19:00:00Z'); // 00:30 IST on the 6th
    expect((await kit.gate.open('mr1', '2026-10-06', madeAt)).reportDate).toBe('2026-10-06');
    expect((await refusal(kit.gate.open('mr1', '2026-10-05', madeAt))).code).toBe('DATE_MISMATCH');
  });

  it('refuses when the day’s Plan is not approved — no Plan, or one still waiting', async () => {
    expect((await refusal(kit.gate.open('mr2', DAY, AT))).code).toBe('DAILY_PLAN_NOT_APPROVED');
    expect(kit.dcrs.rows).toHaveLength(0); // and no envelope is made for a refused record
  });

  it('refuses a month whose Monthly Plan is not approved, even with the day’s Plan approved — and says so before the daily check', async () => {
    kit.planning.monthlyBlocked.add('mr1:2026-10');
    expect((await refusal(kit.gate.open('mr1', DAY, AT))).code).toBe('MONTHLY_PLAN_NOT_APPROVED');
    expect((await refusal(kit.gate.open('mr2', DAY, AT))).code).toBe('DAILY_PLAN_NOT_APPROVED'); // another month/user is unaffected
    expect(kit.dcrs.rows).toHaveLength(0);
  });

  it('a stale cache cannot get past it: the phone thought the Plan was approved, the server knows it was rejected since', async () => {
    kit.planning.approved.delete(`mr1:${DAY}`);
    expect((await refusal(kit.gate.open('mr1', DAY, AT))).code).toBe('DAILY_PLAN_NOT_APPROVED');
  });

  describe('the DCR already sent', () => {
    it.each(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'] as const)('is locked once %s', async (status) => {
      const dcr = await kit.gate.open('mr1', DAY, AT);
      await kit.approvals.submit({ kind: 'DCR', recordId: dcr.id, submitterId: 'mr1' });
      kit.approvals.setStatus(dcr.id, status);
      expect((await refusal(kit.gate.open('mr1', DAY, AT))).code).toBe('DCR_LOCKED');
    });

    it.each(['REJECTED', 'WITHDRAWN', 'REOPENED'] as const)('can be added to again once %s', async (status) => {
      const dcr = await kit.gate.open('mr1', DAY, AT);
      await kit.approvals.submit({ kind: 'DCR', recordId: dcr.id, submitterId: 'mr1' });
      kit.approvals.setStatus(dcr.id, status);
      expect((await kit.gate.open('mr1', DAY, AT)).id).toBe(dcr.id);
    });
  });

  it('two simultaneous first records of the day get the same envelope', async () => {
    const [a, b] = await Promise.all([kit.gate.open('mr1', DAY, AT), kit.gate.open('mr1', DAY, AT)]);
    expect(a.id).toBe(b.id);
    expect(kit.dcrs.rows).toHaveLength(1);
  });
});

describe('submitting the day’s DCR', () => {
  let kit: ReturnType<typeof faKit>;
  const ctx = {};
  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
  });

  it('sends it to the manager as a DCR request and returns the DCR’s id; a day with no calls is a valid report', async () => {
    const { dcrId, request } = await kit.submit.execute('mr1', DAY, AT, ctx);
    expect(request).toMatchObject({ kind: 'DCR', recordId: dcrId, submitterId: 'mr1', status: 'SUBMITTED', cycle: 1 });
    expect(kit.dcrs.rows).toHaveLength(1);
  });

  it('a meeting or conference day needs the day’s note; a strike day or a field day does not, and the note is kept', async () => {
    for (const workingType of ['MEETING', 'CONFERENCE'] as const) {
      kit.planning.days.set(`mr1:${DAY}`, { workingType, routeIds: [] });
      expect((await refusal(kit.submit.execute('mr1', DAY, AT, ctx))).code).toBe('REMARKS_REQUIRED');
      expect((await refusal(kit.submit.execute('mr1', DAY, AT, ctx, '  '))).code).toBe('REMARKS_REQUIRED');
    }
    expect(kit.approvals.requests.size).toBe(0);
    const { dcrId } = await kit.submit.execute('mr1', DAY, AT, ctx, 'Quarterly review at the Siliguri office');
    expect(kit.dcrs.rows.find((d) => d.id === dcrId)!.remarks).toBe('Quarterly review at the Siliguri office');
    kit.planning.days.set('mr1:2026-10-04', { workingType: 'STRIKE', routeIds: [] });
    kit.planning.approve('mr1', '2026-10-04');
    expect((await kit.submit.execute('mr1', '2026-10-04', new Date('2026-10-04T04:00:00Z'), ctx)).request.status).toBe('SUBMITTED');
  });

  it('is refused by the same gate: blocked, a future day, another day’s record, an unapproved Plan', async () => {
    kit.users.users.get('mr2')!.blocked = true;
    kit.planning.approve('mr2', DAY);
    expect((await refusal(kit.submit.execute('mr2', DAY, AT, ctx))).code).toBe('USER_BLOCKED');
    kit.planning.approve('mr1', '2026-10-09');
    expect((await refusal(kit.submit.execute('mr1', '2026-10-09', AT, ctx))).code).toBe('DATE_IN_FUTURE');
    expect((await refusal(kit.submit.execute('stranger', DAY, AT, ctx))).code).toBe('DAILY_PLAN_NOT_APPROVED');
    expect(kit.approvals.requests.size).toBe(0);
  });

  it('a second submit while it is waiting or approved is DCR_LOCKED; after a rejection it is a new cycle on the same request', async () => {
    const first = await kit.submit.execute('mr1', DAY, AT, ctx);
    expect((await refusal(kit.submit.execute('mr1', DAY, AT, ctx))).code).toBe('DCR_LOCKED');
    kit.approvals.setStatus(first.dcrId, 'REJECTED');
    const again = await kit.submit.execute('mr1', DAY, AT, ctx);
    expect(again.dcrId).toBe(first.dcrId);
    expect(again.request).toMatchObject({ id: first.request.id, cycle: 2, status: 'SUBMITTED' });
  });
});

describe('did they report the day? (hasQualifyingDcr)', () => {
  it('true once submitted or further; false for no DCR, a draft, or one sent back', async () => {
    const kit = faKit();
    kit.planning.approve('mr1', DAY);
    const q = new HasQualifyingDcrUseCase(kit.dcrs, kit.approvals);
    expect(await q.execute('mr1', DAY)).toBe(false); // nothing yet
    const dcr = await kit.gate.open('mr1', DAY, AT);
    expect(await q.execute('mr1', DAY)).toBe(false); // an envelope with no submit is a draft
    await kit.approvals.submit({ kind: 'DCR', recordId: dcr.id, submitterId: 'mr1' });
    for (const [status, expected] of [['SUBMITTED', true], ['MANAGER_APPROVED', true], ['APPROVED', true], ['REJECTED', false], ['WITHDRAWN', false], ['REOPENED', false]] as const) {
      kit.approvals.setStatus(dcr.id, status);
      expect(await q.execute('mr1', DAY)).toBe(expected);
    }
    expect(await q.execute('mr1', '2026-10-04')).toBe(false); // another day
  });
});
