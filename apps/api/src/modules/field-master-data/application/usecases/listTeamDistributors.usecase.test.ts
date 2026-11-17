import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { FakeDistributors, FakeUsers } from './fmdTestKit.js';
import { ListTeamDistributorsUseCase } from './listTeamDistributors.usecase.js';

const page = { page: 1, pageSize: 20 };
const field = (id: string) => ({ id, role: 'FIELD' as const });
const dist = (id: string, name: string, assignedUserIds: string[], status = 'active') => ({ id, name, status, assignedUserIds }) as never;

describe('a manager’s distributors', () => {
  let distributors: FakeDistributors;
  let list: ListTeamDistributorsUseCase;
  beforeEach(() => {
    distributors = new FakeDistributors();
    distributors.rows.push(dist('d1', 'Alpha Agencies', ['mr1', 'mr2']), dist('d2', 'Beta Traders', ['mr2']), dist('d3', 'Gamma Dist', ['stranger']), dist('d4', 'Old Co', ['mr1'], 'inactive'));
    list = new ListTeamDistributorsUseCase(distributors, new FakeUsers());
  });

  it('is the union over the team: each distributor once, active only, with the team members who hold it', async () => {
    const r = await list.execute(field('asm'), page);
    expect(r.items.map((d) => d.name)).toEqual(['Alpha Agencies', 'Beta Traders']);
    expect(r.items[0]!.assignedTo.map((a) => a.userId)).toEqual(['mr1', 'mr2']);
  });

  it('never reveals assignees outside the team', async () => {
    distributors.rows.push(dist('d5', 'Shared', ['mr1', 'stranger']));
    const shared = (await list.execute(field('asm'), page)).items.find((d) => d.id === 'd5')!;
    expect(shared.assignedTo.map((a) => a.userId)).toEqual(['mr1']);
  });

  it('when an MR leaves, a distributor only they held drops out; a shared one stays', async () => {
    await distributors.removeAssignee('mr2');
    expect((await list.execute(field('asm'), page)).items.map((d) => d.name)).toEqual(['Alpha Agencies']);
  });

  it('narrows to one report, and refuses someone outside the team', async () => {
    expect((await list.execute(field('asm'), { ...page, userId: 'mr1' })).items.map((d) => d.id)).toEqual(['d1']);
    const err = await list.execute(field('stranger'), { ...page, userId: 'mr1' }).catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(403);
    expect((await list.execute(field('stranger'), page)).items.map((d) => d.id)).toEqual(['d3']); // only their own
  });
});
