import { beforeEach, describe, expect, it } from 'vitest';
import { faKit, Tx } from './faTestKit.js';

const DAY = '2026-10-05';
const AT = new Date('2026-10-05T04:00:00Z');

describe('DCR_APPROVAL_REQUIRED', () => {
  let kit: ReturnType<typeof faKit>;
  const auto = () => kit.expenses.rows.filter((r) => r.source === 'AUTO');

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-1'] });
  });

  it('on (the default): the DCR waits for approval and earns no TA/DA yet', async () => {
    const { request } = await kit.submit.execute('mr1', DAY, AT, new Tx());
    expect(request.status).toBe('SUBMITTED');
    expect(auto()).toHaveLength(0);
  });

  it('off: the DCR is approved at submit and its TA/DA is generated from the approved Plan day', async () => {
    kit.config.values.DCR_APPROVAL_REQUIRED = 'false';
    const { request } = await kit.submit.execute('mr1', DAY, AT, new Tx());
    expect(request.status).toBe('APPROVED');
    expect(auto()).toEqual([expect.objectContaining({ type: 'TA', routeId: 'route-1', paymentStatus: 'UNPAID', accepted: true })]);
  });

  it('off: a DCR with an unapproved Plan is still refused, so there is no TA/DA without an approved Plan', async () => {
    kit.config.values.DCR_APPROVAL_REQUIRED = 'false';
    kit.planning.approved.clear();
    await expect(kit.submit.execute('mr1', DAY, AT, new Tx())).rejects.toMatchObject({ code: 'DAILY_PLAN_NOT_APPROVED' });
    expect(auto()).toHaveLength(0);
  });
});
