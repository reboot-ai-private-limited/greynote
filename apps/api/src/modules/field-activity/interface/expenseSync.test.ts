import { beforeEach, describe, expect, it } from 'vitest';
import { MANUAL_EXPENSE_TYPES, SYNC_RECORD_KINDS, type ExpensePayload } from '@greynote/contracts';
import { SyncRejection } from '@/modules/sync/sync.public.js';
import { EXPENSE_SYNC_KIND, makeExpenseSyncHandler } from '../application/expenseSync.js';
import { faKit, Tx } from '../application/usecases/faTestKit.js';
import { MANUAL_EXPENSE_TYPES as SERVER_TYPES } from '../domain/expense.entity.js';
import { expensePayloadSchema } from './field-activity.schemas.js';

const DAY = '2026-10-05';

describe('the EXPENSE record', () => {
  let kit: ReturnType<typeof faKit>;
  let handler: ReturnType<typeof makeExpenseSyncHandler>;
  const run = (payload: unknown, tx = new Tx()) => handler.apply({ userId: 'mr1', clientId: 'c-1', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload }, tx);

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    handler = makeExpenseSyncHandler(kit.logExpense, (p) => expensePayloadSchema.parse(p));
  });

  it('is the contract’s kind, with the contract’s types', () => {
    expect(EXPENSE_SYNC_KIND).toBe('EXPENSE');
    expect(SYNC_RECORD_KINDS).toContain('EXPENSE');
    expect([...SERVER_TYPES]).toEqual([...MANUAL_EXPENSE_TYPES]);
  });

  it('stores a MANUAL, UNPAID expense in paise on the day’s DCR', async () => {
    const payload: ExpensePayload = { reportDate: DAY, type: 'MEAL', amountPaise: 25050, remarks: 'lunch with the doctor' };
    const out = await run(payload);
    expect(out.serverId).toEqual(expect.any(String));
    expect(kit.expenses.rows).toEqual([expect.objectContaining({ type: 'MEAL', source: 'MANUAL', amountPaise: 25050, paymentStatus: 'UNPAID', routeId: null, distanceFlag: false, clientId: 'c-1' })]);
    expect(kit.dcrs.rows).toHaveLength(1);
  });

  it('refuses TA and DA (the server computes those), decimals, zero and negatives — as INVALID_PAYLOAD', async () => {
    for (const bad of [
      { reportDate: DAY, type: 'TA', amountPaise: 100 },
      { reportDate: DAY, type: 'DA', amountPaise: 100 },
      { reportDate: DAY, type: 'MISC', amountPaise: 100.5 },
      { reportDate: DAY, type: 'MISC', amountPaise: 0 },
      { reportDate: DAY, type: 'MISC', amountPaise: -5 },
      { reportDate: DAY, type: 'MISC' },
    ]) {
      const err = await run(bad).then(() => undefined, (e: unknown) => e);
      expect(err).toBeInstanceOf(SyncRejection);
      expect((err as SyncRejection).code).toBe('INVALID_PAYLOAD');
    }
    expect(kit.expenses.rows).toHaveLength(0);
  });

  it('goes through the gate: no approved Plan → refused, nothing stored', async () => {
    
    const err = await handler.apply({ userId: 'nobody', clientId: 'c-2', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload: { reportDate: DAY, type: 'MISC', amountPaise: 100 } }, new Tx()).then(() => undefined, (e: unknown) => e);
    expect((err as SyncRejection).code).toBe('DAILY_PLAN_NOT_APPROVED');
    expect(kit.expenses.rows).toHaveLength(0);
  });
});
