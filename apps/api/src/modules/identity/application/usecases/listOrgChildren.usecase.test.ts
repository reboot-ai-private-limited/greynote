import { describe, expect, it, vi } from 'vitest';
import { ListOrgChildrenUseCase } from './listOrgChildren.usecase.js';

const user = (id: string) => ({ id, employeeCode: id, name: id, roleId: 'r', status: 'ACTIVE' });

function build(items: Array<{ userId: string; directCount: number }>, total: number) {
  const findChildrenPage = vi.fn(async () => ({ items, total }));
  const profiles = {
    findChildrenPage,
    findByUserIds: async (ids: string[]) => ids.map((id) => ({ userId: id, designationId: null, managerId: null, hqId: `hq-${id}`, photo: null })),
  };
  const users = { findByIds: async (ids: string[]) => ids.filter((id) => id !== 'gone').map(user) };
  const roles = { list: async () => [{ id: 'r', name: 'FIELD' }] };
  const useCase = new ListOrgChildrenUseCase(users as never, roles as never, profiles as never);
  return { useCase, findChildrenPage };
}

describe('ListOrgChildrenUseCase', () => {
  it('returns the page in the repository order with counts and HQ', async () => {
    const { useCase, findChildrenPage } = build([{ userId: 'b', directCount: 3 }, { userId: 'a', directCount: 0 }], 30);
    const result = await useCase.execute('boss', { page: 2, pageSize: 25 });
    expect(findChildrenPage).toHaveBeenCalledWith('boss', { skip: 25, limit: 25 });
    expect(result.items.map((i) => [i.id, i.directCount, i.hqId])).toEqual([['b', 3, 'hq-b'], ['a', 0, 'hq-a']]);
    expect(result.total).toBe(30);
    expect(result.totalPages).toBe(2);
  });

  it('skips a profile whose user is gone', async () => {
    const { useCase } = build([{ userId: 'gone', directCount: 0 }, { userId: 'a', directCount: 1 }], 2);
    const result = await useCase.execute(null, { page: 1, pageSize: 25 });
    expect(result.items.map((i) => i.id)).toEqual(['a']);
  });
});
