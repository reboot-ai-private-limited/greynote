import { beforeEach, describe, expect, it } from 'vitest';
import type { LateGrant } from '@/modules/lateGrants/lateGrants.public.js';
import { GateRefusal } from '../../domain/gateRefusal.js';
import { DcrClock } from '../dcrClock.js';
import type { DcrLatePort, DcrLateStatus } from '../dcrLate.port.js';
import { DcrSubmitDeadline } from '../dcrSubmitDeadline.js';
import { DcrMonthLock } from '../dcrMonthLock.js';
import { LoggingGate } from '../loggingGate.js';
import { SubmitDcrUseCase } from './submitDcr.usecase.js';
import { faKit } from './faTestKit.js';

const DAY = '2026-10-05';
const AT = new Date('2026-10-05T04:00:00Z'); // 09:30 IST on DAY
const CTX = {} as never;

const grantFor = (userId: string, periodKey: string): LateGrant => ({
  id: 'g1', userId, kind: 'DCR_SUBMIT', periodKey, reason: 'was on a trip', grantedBy: 'admin', grantedByRole: 'ADMIN',
  grantedAt: new Date('2026-11-09T00:00:00Z'), expiresAt: new Date('2026-11-30T00:00:00Z'), status: 'OPEN', usedAt: null, usedRef: null, revokedAt: null, revokedBy: null,
});

describe('the monthly cutoff of a daily report', () => {
  let kit: ReturnType<typeof faKit>;
  let grants: LateGrant[];
  let spent: Array<{ id: string; ref: string }>;
  let gate: LoggingGate;
  let monthLock: DcrMonthLock;
  let finalized: Set<string>;
  let submit: SubmitDcrUseCase;

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    grants = [];
    spent = [];
    const deadline = new DcrSubmitDeadline(kit.config);
    const late: DcrLatePort = {
      async check(userId, reportDate): Promise<DcrLateStatus> {
        const due = await deadline.of(reportDate);
        if (!due || kit.clock.current <= due) return { status: 'ON_TIME' };
        const grant = grants.find((g) => g.userId === userId && g.periodKey === reportDate);
        return grant ? { status: 'LATE_ALLOWED', grant } : { status: 'LATE', deadline: due };
      },
      async consume(grant, dcrId) {
        spent.push({ id: grant.id, ref: dcrId });
      },
    };
    const clock = new DcrClock(kit.config, () => kit.clock.current);
    monthLock = new DcrMonthLock();
    finalized = new Set();
    monthLock.bind(async (userId, month) => finalized.has(`${userId}:${month}`));
    gate = new LoggingGate(kit.users, kit.planning, kit.approvals, kit.dcrs, clock, late, monthLock);
    submit = new SubmitDcrUseCase(gate, kit.dcrs, kit.approvals, kit.taDa, kit.config, kit.planning, late);
  });

  const refusal = async (p: Promise<unknown>): Promise<GateRefusal> => {
    const err = await p.then(() => undefined, (e: unknown) => e);
    expect(err).toBeInstanceOf(GateRefusal);
    return err as GateRefusal;
  };

  it('has no deadline while DCR_SUBMIT_CUTOFF_DAY is 0', async () => {
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '0';
    kit.clock.current = new Date('2027-03-01T06:30:00Z');
    expect(await new DcrSubmitDeadline(kit.config).of(DAY)).toBeNull();
    await expect(submit.execute('mr1', DAY, AT, CTX)).resolves.toMatchObject({ dcrId: expect.any(String) });
  });

  it('is due before the cutoff day of the next month begins: day 1 means the end of the month’s last day', async () => {
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '1';
    expect((await new DcrSubmitDeadline(kit.config).of(DAY))?.toISOString()).toBe('2026-10-31T18:29:59.999Z'); // 1 Nov 00:00 IST, less 1 ms
    expect((await new DcrSubmitDeadline(kit.config).of('2026-12-10'))?.toISOString()).toBe('2026-12-31T18:29:59.999Z'); // December rolls into January
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '5';
    expect((await new DcrSubmitDeadline(kit.config).of(DAY))?.toISOString()).toBe('2026-11-04T18:29:59.999Z');
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '1';
    kit.config.values['DAY_START_TIME'] = '02:00';
    expect((await new DcrSubmitDeadline(kit.config).of(DAY))?.toISOString()).toBe('2026-10-31T20:29:59.999Z'); // 02:00 IST on the 1st
  });

  it('lets the report in until the month ends, and refuses it from the 1st with DCR_SUBMIT_LATE', async () => {
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '1';
    kit.clock.current = new Date('2026-10-31T12:00:00Z'); // 17:30 IST on 31 Oct
    await expect(gate.open('mr1', DAY, AT)).resolves.toMatchObject({ reportDate: DAY });
    kit.clock.current = new Date('2026-10-31T19:00:00Z'); // 00:30 IST on 1 Nov
    const r = await refusal(gate.open('mr1', DAY, AT));
    expect(r.code).toBe('DCR_SUBMIT_LATE');
    expect(r.message).toContain('Ask Admin');
    expect(await refusal(submit.execute('mr1', DAY, AT, CTX))).toMatchObject({ code: 'DCR_SUBMIT_LATE' });
    expect(spent).toHaveLength(0);
  });

  it('lets a late day through with Admin’s exception, and spends it once on the final submit — not on a call', async () => {
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '1';
    kit.clock.current = new Date('2026-11-10T12:00:00Z');
    grants.push(grantFor('mr1', DAY));
    await gate.open('mr1', DAY, AT);
    expect(spent).toHaveLength(0);
    const { dcrId } = await submit.execute('mr1', DAY, AT, CTX);
    expect(spent).toEqual([{ id: 'g1', ref: dcrId }]);
  });

  it('is per employee and per day: another employee’s or another day’s exception does not help', async () => {
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '1';
    kit.clock.current = new Date('2026-11-10T12:00:00Z');
    grants.push(grantFor('mr2', DAY), grantFor('mr1', '2026-10-04'));
    expect((await refusal(gate.open('mr1', DAY, AT))).code).toBe('DCR_SUBMIT_LATE');
  });

  it('locks the month once the salary is finalized: no record, no submit, even with Admin’s exception', async () => {
    kit.config.values['DCR_SUBMIT_CUTOFF_DAY'] = '1';
    kit.clock.current = new Date('2026-11-10T12:00:00Z');
    grants.push(grantFor('mr1', DAY));
    finalized.add('mr1:2026-10');
    expect((await refusal(gate.open('mr1', DAY, AT))).code).toBe('PAYROLL_FINALIZED');
    expect((await refusal(submit.execute('mr1', DAY, AT, CTX))).code).toBe('PAYROLL_FINALIZED');
    expect(spent).toHaveLength(0);
    // another employee, or an open month, is not affected
    kit.planning.approve('mr2', DAY);
    expect(await gate.open('mr2', DAY, AT).then(() => 'open', (e: unknown) => (e as GateRefusal).code)).toBe('DCR_SUBMIT_LATE');
  });

  it('answers a removal or a decision on a finalized month with a 409 PAYROLL_FINALIZED', async () => {
    finalized.add('mr1:2026-10');
    await expect(monthLock.assertUnlocked('mr1', DAY)).rejects.toMatchObject({ statusCode: 409 });
    await expect(monthLock.assertUnlocked('mr1', '2026-11-02')).resolves.toBeUndefined();
    await expect(new DcrMonthLock().assertUnlocked('mr1', DAY)).resolves.toBeUndefined(); // not bound (a script): nothing locked
  });
});
