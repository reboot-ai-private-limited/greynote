import { beforeEach, describe, expect, it } from 'vitest';
import { FakeTeam } from './teamKit.js';
import { TeamExpensesUseCase } from './teamExpenses.usecase.js';

describe('the team’s expenses for a month', () => {
  let kit: FakeTeam;
  beforeEach(() => {
    kit = new FakeTeam();
    kit.expenseMonths.set('asm1', { status: 'SUBMITTED', taPaise: 100_000, daPaise: 50_000, otherPaise: 0 });
    kit.expenseMonths.set('mr1', { status: 'APPROVED', taPaise: 200_000, daPaise: 80_000, otherPaise: 5_000 });
    kit.expenseMonths.set('mr2', { status: 'REJECTED', taPaise: 10_000, daPaise: 0, otherPaise: 0 });
  });

  it('one row per active person with the month’s state, those not sent first, and the sum of the three parts', async () => {
    const out = await new TeamExpensesUseCase(kit, kit).execute('rsm', { month: '2026-11' });
    expect(out.items.map((r) => [r.user.id, r.status])).toEqual([
      ['asm2', 'NOT_SENT'],
      ['mr2', 'SENT_BACK'],
      ['asm1', 'WAITING'],
      ['mr1', 'APPROVED'],
    ]);
    expect(out.items.find((r) => r.user.id === 'mr1')).toMatchObject({ taPaise: 200_000, daPaise: 80_000, otherPaise: 5_000, totalPaise: 285_000 });
  });

  it('only a direct report’s waiting month is waiting on the caller, and one status can be asked for', async () => {
    const all = await new TeamExpensesUseCase(kit, kit).execute('rsm', { month: '2026-11' });
    expect(all.items.find((r) => r.user.id === 'asm1')?.waitingOnYou).toBe(true);
    const only = await new TeamExpensesUseCase(kit, kit).execute('rsm', { month: '2026-11', status: 'APPROVED' });
    expect(only.items.map((r) => r.user.id)).toEqual(['mr1']);
    expect(only.total).toBe(1);
  });
});
