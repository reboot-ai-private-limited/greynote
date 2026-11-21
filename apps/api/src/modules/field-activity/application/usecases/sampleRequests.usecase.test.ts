import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import { buildBalance, type SampleRequest } from '../../domain/sampleRequest.entity.js';
import type { GivenTotalsPort, SampleRequestRepositoryPort } from '../../domain/sampleRequest.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { CancelSampleRequestUseCase, CreateSampleRequestUseCase, ListSampleRequestsUseCase, MarkSampleRequestDoneUseCase, SampleAccountUseCase } from './sampleRequests.usecase.js';

class FakeRequests implements SampleRequestRepositoryPort {
  rows: SampleRequest[] = [];
  async create(input: Omit<SampleRequest, 'id'>) {
    const row = { ...input, id: `r${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list(f: { userId?: string; status?: string; kind?: string }) {
    return this.rows.filter((r) => (!f.userId || r.userId === f.userId) && (!f.status || r.status === f.status) && (!f.kind || r.kind === f.kind));
  }
  async markDone(id: string, by: string, at: Date, credits: Array<{ productId: string; creditedQuantity: number }>) {
    const r = this.rows.find((x) => x.id === id && x.status === 'REQUESTED');
    if (!r) return null;
    r.status = 'DONE';
    r.doneBy = by;
    r.doneAt = at;
    r.lines = r.lines.map((l) => ({ ...l, creditedQuantity: credits.find((c) => c.productId === l.productId)?.creditedQuantity ?? l.quantity }));
    return r;
  }
  async cancel(id: string, userId: string) {
    const r = this.rows.find((x) => x.id === id && x.userId === userId && x.status === 'REQUESTED');
    if (!r) return false;
    r.status = 'CANCELLED';
    return true;
  }
}

const PRODUCTS: Record<string, { id: string; name: string; status: string }> = { p1: { id: 'p1', name: 'Cough Syrup', status: 'active' }, p2: { id: 'p2', name: 'Vitamin', status: 'active' }, p3: { id: 'p3', name: 'Retired', status: 'inactive' } };
const master = { getProduct: async (id: string) => (PRODUCTS[id] as never) ?? null } as unknown as FieldMasterDataPort;
const people = [
  { id: 'mr1', name: 'MR One', employeeCode: 'E1', role: 'FIELD', status: 'active' },
  { id: 'mr2', name: 'MR Two', employeeCode: 'E2', role: 'FIELD', status: 'active' },
  { id: 'asm', name: 'ASM', employeeCode: 'E3', role: 'FIELD', status: 'active' },
];
const users = {
  getUserSummaries: async (ids: string[]) => people.filter((p) => ids.includes(p.id)),
  findUserSummary: async (id: string) => people.find((p) => p.id === id) ?? null,
  getDownline: async (id: string) => (id === 'asm' ? people.filter((p) => p.id.startsWith('mr')) : []),
} as unknown as UserDirectoryPort;

describe('Sample and LBL requests', () => {
  let repo: FakeRequests;
  let given: { samples: Array<{ productId: string; quantity: number }>; lbl: Array<{ productId: string; quantity: number }> };
  let create: CreateSampleRequestUseCase;
  let done: MarkSampleRequestDoneUseCase;
  let account: SampleAccountUseCase;
  const admin = { id: 'admin1', role: 'ADMIN' as const };

  beforeEach(() => {
    repo = new FakeRequests();
    given = { samples: [], lbl: [] };
    const givenPort: GivenTotalsPort = { givenBy: async () => given };
    create = new CreateSampleRequestUseCase(repo, master, users);
    done = new MarkSampleRequestDoneUseCase(repo, master, users);
    account = new SampleAccountUseCase(repo, givenPort, master, users);
  });

  it('an employee requests samples or LBL for active products, with names on the view', async () => {
    const view = await create.execute('mr1', { kind: 'SAMPLE', lines: [{ productId: 'p1', quantity: 20 }, { productId: 'p2', quantity: 5 }] });
    expect(view).toMatchObject({ status: 'REQUESTED', userName: 'MR One', lines: [{ productName: 'Cough Syrup', quantity: 20, creditedQuantity: null }, { productName: 'Vitamin' }] });
  });

  it('refuses an unknown or inactive product and a product listed twice', async () => {
    await expect(create.execute('mr1', { kind: 'LBL', lines: [{ productId: 'p9', quantity: 1 }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(create.execute('mr1', { kind: 'LBL', lines: [{ productId: 'p3', quantity: 1 }] })).rejects.toMatchObject({ statusCode: 409 });
    await expect(create.execute('mr1', { kind: 'LBL', lines: [{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }] })).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.rows).toHaveLength(0);
  });

  it('Admin, Accounts and HR mark it done and credit the requested quantity, or the one they changed', async () => {
    await create.execute('mr1', { kind: 'SAMPLE', lines: [{ productId: 'p1', quantity: 20 }, { productId: 'p2', quantity: 5 }] });
    const result = await done.execute({ id: 'acc1', role: 'ACCOUNTANT' }, 'r1', [{ productId: 'p1', quantity: 15 }]);
    expect(result).toMatchObject({ status: 'DONE', doneBy: 'acc1' });
    expect(result.lines.map((l) => l.creditedQuantity)).toEqual([15, 5]);
  });

  it('an employee or a manager cannot mark one done; a done one cannot be marked again; a product off the request is refused', async () => {
    await create.execute('mr1', { kind: 'SAMPLE', lines: [{ productId: 'p1', quantity: 20 }] });
    await expect(done.execute({ id: 'asm', role: 'FIELD' }, 'r1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(done.execute(admin, 'r1', [{ productId: 'p2', quantity: 1 }])).rejects.toMatchObject({ statusCode: 400 });
    await done.execute(admin, 'r1');
    await expect(done.execute(admin, 'r1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('the owner can cancel only while it is waiting; nobody else can', async () => {
    const cancel = new CancelSampleRequestUseCase(repo);
    await create.execute('mr1', { kind: 'LBL', lines: [{ productId: 'p1', quantity: 10 }] });
    await expect(cancel.execute('mr2', 'r1')).rejects.toBeInstanceOf(AppError);
    await cancel.execute('mr1', 'r1');
    expect(repo.rows[0]!.status).toBe('CANCELLED');
    await expect(cancel.execute('mr1', 'r1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('only Admin, Accounts and HR see the queue; an employee sees their own', async () => {
    const list = new ListSampleRequestsUseCase(repo, master, users);
    await create.execute('mr1', { kind: 'SAMPLE', lines: [{ productId: 'p1', quantity: 1 }] });
    await create.execute('mr2', { kind: 'LBL', lines: [{ productId: 'p2', quantity: 1 }] });
    await expect(list.queue({ id: 'mr1', role: 'FIELD' }, {})).rejects.toMatchObject({ statusCode: 403 });
    expect(await list.queue({ id: 'hr1', role: 'HR' }, {})).toHaveLength(2);
    expect(await list.queue(admin, { kind: 'LBL' })).toHaveLength(1);
    expect(await list.mine('mr1')).toHaveLength(1);
  });

  it('the account shows requested, credited, given and left per product, and left can go below zero', async () => {
    await create.execute('mr1', { kind: 'SAMPLE', lines: [{ productId: 'p1', quantity: 20 }] });
    await create.execute('mr1', { kind: 'SAMPLE', lines: [{ productId: 'p1', quantity: 10 }] }); // still waiting: asked for, not credited
    await create.execute('mr1', { kind: 'LBL', lines: [{ productId: 'p2', quantity: 3 }] });
    await done.execute(admin, 'r1');
    await done.execute(admin, 'r3');
    given = { samples: [{ productId: 'p1', quantity: 25 }], lbl: [{ productId: 'p2', quantity: 1 }] };
    const a = await account.execute({ id: 'mr1', role: 'FIELD' }, 'mr1');
    expect(a.samples).toEqual([{ productId: 'p1', productName: 'Cough Syrup', requested: 30, credited: 20, given: 25, left: -5 }]);
    expect(a.lbl).toEqual([{ productId: 'p2', productName: 'Vitamin', requested: 3, credited: 3, given: 1, left: 2 }]);
  });

  it('the account is readable by its owner, by a manager above them, and by Admin; not by a peer', async () => {
    await expect(account.execute({ id: 'asm', role: 'FIELD' }, 'mr1')).resolves.toMatchObject({ userId: 'mr1' });
    await expect(account.execute(admin, 'mr1')).resolves.toMatchObject({ userName: 'MR One' });
    await expect(account.execute({ id: 'mr2', role: 'FIELD' }, 'mr1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('a given product with no request still shows, with nothing credited', () => {
    const rows = buildBalance([], { samples: [{ productId: 'p1', quantity: 2 }], lbl: [] }, () => 'X');
    expect(rows.samples).toEqual([{ productId: 'p1', productName: 'X', requested: 0, credited: 0, given: 2, left: -2 }]);
  });
});
