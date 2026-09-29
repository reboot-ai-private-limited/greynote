import { beforeEach, describe, expect, it } from 'vitest';
import { faKit, Tx } from './faTestKit.js';

// The kit's clock is 2026-10-05 12:00 IST (a Monday), so the run looks back from Sunday 2026-10-04.
// Mon 09-28 … Sun 10-04 are the days that matter; weekly off is set per test.
const submitDay = async (kit: ReturnType<typeof faKit>, userId: string, date: string) => {
  kit.planning.approve(userId, date);
  await kit.submit.execute(userId, date, new Date(`${date}T04:00:00Z`), new Tx());
};

describe('the missed-DCR job', () => {
  let kit: ReturnType<typeof faKit>;
  beforeEach(() => {
    kit = faKit();
    kit.config.values.DCR_MISS_BLOCK_ENABLED = 'true';
    kit.config.values.DCR_MISS_GRACE_DAYS = '1';
    kit.users.add('mr3', { managerId: 'asm' });
  });
  const blockedIds = async () => (await kit.missedCheck.execute()).blocked.map((b) => b.userId).sort();

  it('does nothing when disabled', async () => {
    kit.config.values.DCR_MISS_BLOCK_ENABLED = 'false';
    expect(await kit.missedCheck.execute()).toMatchObject({ enabled: false, checked: 0, blocked: [] });
    expect(kit.users.users.get('mr1')!.blocked).toBe(false);
  });

  it('with a grace of 1, one missed day is tolerated and two in a row block; the reason names the days', async () => {
    // mr1 reported Sunday 10-04 → fine. mr2 missed Sunday only. mr3 missed Saturday and Sunday.
    await submitDay(kit, 'mr1', '2026-10-04');
    await submitDay(kit, 'mr2', '2026-10-03');
    // mr3: nothing at all → blocked; mr2 reported Saturday but missed Sunday → one miss, tolerated
    const run = await kit.missedCheck.execute();
    expect(run).toMatchObject({ through: '2026-10-04', graceDays: 1 });
    expect(run.blocked.map((b) => b.userId)).toEqual(['mr3']);
    expect(run.blocked[0]!.missedDates).toEqual(['2026-10-03', '2026-10-04']);
    expect(kit.users.blockCalls[0]!.reason).toBe('DCR_MISSED_NO_LEAVE: no report for 2026-10-03, 2026-10-04');
    expect(kit.users.users.get('mr2')!.blocked).toBe(false);
  });

  it('a grace of 0 blocks on the first miss; a bigger grace waits longer', async () => {
    kit.config.values.DCR_MISS_GRACE_DAYS = '0';
    await submitDay(kit, 'mr1', '2026-10-03');
    await submitDay(kit, 'mr2', '2026-10-03');
    expect(await blockedIds()).toEqual(['mr1', 'mr2', 'mr3']);
    kit.users.users.forEach((u) => (u.blocked = false));
    kit.config.values.DCR_MISS_GRACE_DAYS = '3';
    expect(await blockedIds()).toEqual(['mr3']);
  });

  it('a reported day ends the run: a DCR that is only SUBMITTED counts; a rejected one does not', async () => {
    await submitDay(kit, 'mr1', '2026-10-04');
    await submitDay(kit, 'mr2', '2026-10-04');
    kit.approvals.setStatus(kit.dcrs.rows.find((d) => d.userId === 'mr2')!.id, 'REJECTED');
    expect(await blockedIds()).toEqual(['mr2', 'mr3']);
  });

  it('weekly offs and holidays are skipped: they neither count nor break the run', async () => {
    kit.config.values.DCR_MISS_GRACE_DAYS = '1';
    kit.leave.offDays.add('2026-10-04'); // Sunday off
    await submitDay(kit, 'mr1', '2026-10-03');
    await submitDay(kit, 'mr2', '2026-10-02');
    // mr1 reported Sat; Sun is off → not blocked. mr2 reported Fri, missed Sat, Sun off → 1 miss, tolerated.
    // mr3 reported nothing: Sat, Fri missed (Sun skipped) → blocked, and the run spans the day off
    const run = await kit.missedCheck.execute();
    expect(run.blocked.map((b) => b.userId)).toEqual(['mr3']);
    expect(run.blocked[0]!.missedDates).toEqual(['2026-10-02', '2026-10-03']);
  });

  it('an approved Leave excuses its days without breaking the run', async () => {
    kit.leave.leaveDays.add('mr3:2026-10-04');
    kit.leave.leaveDays.add('mr3:2026-10-03');
    kit.leave.leaveDays.add('mr3:2026-10-02');
    // mr3 is on leave Fri–Sun; before that (Thu 10-01, Wed 09-30) nothing → blocked for those two
    const run = await kit.missedCheck.execute();
    const mr3 = run.blocked.find((b) => b.userId === 'mr3')!;
    expect(mr3.missedDates).toEqual(['2026-09-30', '2026-10-01']);
    kit.users.users.get('mr3')!.blocked = false;
    for (let i = 0; i < 31; i += 1) kit.leave.leaveDays.add(`mr3:${new Date(Date.UTC(2026, 9, 4 - i)).toISOString().slice(0, 10)}`); // a long leave: nothing left to miss
    expect((await blockedIds()).includes('mr3')).toBe(false);
  });

  it('days before the joining date are nobody’s to report', async () => {
    kit.users.joined.set('mr3', new Date('2026-10-04T00:00:00Z')); // joined Sunday
    expect((await blockedIds()).includes('mr3')).toBe(false); // one possible day: tolerated
    kit.users.joined.set('mr3', new Date('2026-10-03T00:00:00Z'));
    expect((await blockedIds()).includes('mr3')).toBe(true); // two days, both missed
  });

  it('an Admin clearing a block gives a clean slate: only days from the clearing day count', async () => {
    kit.users.clearedAt.set('mr3', new Date('2026-10-04T05:00:00Z')); // cleared on Sunday, mid-morning IST
    expect((await blockedIds()).includes('mr3')).toBe(false); // only Sunday is theirs to report: one miss, tolerated
    kit.users.clearedAt.set('mr3', new Date('2026-10-03T05:00:00Z'));
    expect((await blockedIds()).includes('mr3')).toBe(true);
  });

  it('is safe to run twice: the second run blocks no one again and counts them as already blocked', async () => {
    const first = await kit.missedCheck.execute();
    expect(first.blocked.length).toBeGreaterThan(0);
    const second = await kit.missedCheck.execute();
    expect(second.blocked).toEqual([]);
    expect(second.alreadyBlocked).toBe(first.blocked.length);
    expect(kit.users.blockCalls).toHaveLength(first.blocked.length);
  });

  it('one employee’s failure is recorded and does not stop the rest', async () => {
    kit.users.failBlockFor.add('mr1');
    const run = await kit.missedCheck.execute();
    expect(run.failed).toEqual([{ userId: 'mr1', message: 'boom' }]);
    expect(run.blocked.map((b) => b.userId).sort()).toEqual(['mr2', 'mr3']);
  });

  it('a dry run reports who would be blocked and blocks no one; a user filter narrows the run', async () => {
    const dry = await kit.missedCheck.execute({ dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.blocked.map((b) => b.userId).sort()).toEqual(['mr1', 'mr2', 'mr3']);
    expect(kit.users.blockCalls).toEqual([]);
    expect([...kit.users.users.values()].some((u) => u.blocked)).toBe(false);
    const one = await kit.missedCheck.execute({ userIds: ['mr2'] });
    expect(one).toMatchObject({ checked: 1 });
    expect(one.blocked.map((b) => b.userId)).toEqual(['mr2']);
  });

  it('only FIELD employees are visited, not managers or Admin', async () => {
    const run = await kit.missedCheck.execute();
    expect(run.checked).toBe(3);
  });
});
