import { AppError } from '@/shared/errors/AppError.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import { buildBalance, type SampleBalanceRow, type SampleRequest, type SampleRequestKind, type SampleRequestStatus } from '../../domain/sampleRequest.entity.js';
import type { GivenTotalsPort, SampleRequestRepositoryPort } from '../../domain/sampleRequest.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from './readDcrs.usecase.js';

export type SampleRequestView = Omit<SampleRequest, 'lines'> & {
  userName: string;
  lines: Array<SampleRequest['lines'][number] & { productName: string }>;
};

/** Who may mark a request done (credit the employee), and read anyone's account. */
const HANDLERS = ['ADMIN', 'ACCOUNTANT', 'HR'];

const productName = async (master: FieldMasterDataPort, id: string) => (await master.getProduct(id))?.name ?? 'Removed product';

async function toViews(master: FieldMasterDataPort, users: UserDirectoryPort, rows: SampleRequest[]): Promise<SampleRequestView[]> {
  const names = new Map((await users.getUserSummaries([...new Set(rows.map((r) => r.userId))])).map((u) => [u.id, u.name]));
  return Promise.all(rows.map(async (r) => ({ ...r, userName: names.get(r.userId) ?? '', lines: await Promise.all(r.lines.map(async (l) => ({ ...l, productName: await productName(master, l.productId) }))) })));
}

/** An employee asks for samples or LBL of some products. Online only; every product has to be active. */
export class CreateSampleRequestUseCase {
  constructor(
    private readonly requests: SampleRequestRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, input: { kind: SampleRequestKind; lines: Array<{ productId: string; quantity: number }>; remarks?: string | null }): Promise<SampleRequestView> {
    if (new Set(input.lines.map((l) => l.productId)).size !== input.lines.length) throw AppError.badRequest('A product is listed twice. Give it one line.', { field: 'lines' });
    for (const line of input.lines) {
      const product = await this.master.getProduct(line.productId);
      if (!product) throw AppError.badRequest('No such product.', { field: 'lines' });
      if (product.status !== 'active') throw AppError.conflict(`${product.name} is not available.`, { field: 'lines' });
    }
    const created = await this.requests.create({
      userId,
      kind: input.kind,
      lines: input.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, creditedQuantity: null })),
      remarks: input.remarks ?? null,
      status: 'REQUESTED',
      requestedAt: this.now(),
      doneBy: null,
      doneAt: null,
    });
    return (await toViews(this.master, this.users, [created]))[0]!;
  }
}

/** The employee withdraws a request that nobody has marked done yet. */
export class CancelSampleRequestUseCase {
  constructor(private readonly requests: SampleRequestRepositoryPort) {}

  async execute(userId: string, id: string): Promise<void> {
    const found = await this.requests.findById(id);
    if (!found || found.userId !== userId) throw AppError.notFound('No such request.');
    if (!(await this.requests.cancel(id, userId))) throw AppError.conflict('This request is already done or cancelled.');
  }
}

/** My requests, newest first; or, for Admin, Accounts and HR, everyone's (optionally by status, kind or employee). */
export class ListSampleRequestsUseCase {
  constructor(
    private readonly requests: SampleRequestRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly users: UserDirectoryPort,
  ) {}

  mine(userId: string, limit = 200): Promise<SampleRequestView[]> {
    return this.requests.list({ userId }, limit).then((rows) => toViews(this.master, this.users, rows));
  }

  async queue(actor: Actor, filter: { status?: SampleRequestStatus | undefined; kind?: SampleRequestKind | undefined; userId?: string | undefined }, limit = 500): Promise<SampleRequestView[]> {
    if (!HANDLERS.includes(actor.role)) throw AppError.forbidden();
    const rows = await this.requests.list({ ...(filter.status && { status: filter.status }), ...(filter.kind && { kind: filter.kind }), ...(filter.userId && { userId: filter.userId }) }, limit);
    return toViews(this.master, this.users, rows);
  }
}

/** Admin, Accounts or HR mark a request done: the employee is credited each line's quantity, or the one the marker changed it to. */
export class MarkSampleRequestDoneUseCase {
  constructor(
    private readonly requests: SampleRequestRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, id: string, credits: Array<{ productId: string; quantity: number }> = []): Promise<SampleRequestView> {
    if (!HANDLERS.includes(actor.role)) throw AppError.forbidden();
    const found = await this.requests.findById(id);
    if (!found) throw AppError.notFound('No such request.');
    const lineIds = new Set(found.lines.map((l) => l.productId));
    if (credits.some((c) => !lineIds.has(c.productId))) throw AppError.badRequest('That product is not on this request.', { field: 'credits' });
    const done = await this.requests.markDone(id, actor.id, this.now(), credits.map((c) => ({ productId: c.productId, creditedQuantity: c.quantity })));
    if (!done) throw AppError.conflict('This request is already done or cancelled.');
    return (await toViews(this.master, this.users, [done]))[0]!;
  }
}

export interface SampleAccount {
  userId: string;
  userName: string;
  samples: SampleBalanceRow[];
  lbl: SampleBalanceRow[];
  requests: SampleRequestView[];
}

/**
 * One employee's account: per product, what they asked for, what was credited, what they gave in doctor calls, and what is left (never enforced, so it can be below
 * zero). Readable by the employee, by Admin, Accounts and HR, and by a manager for anyone below them.
 */
export class SampleAccountUseCase {
  constructor(
    private readonly requests: SampleRequestRepositoryPort,
    private readonly given: GivenTotalsPort,
    private readonly master: FieldMasterDataPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, userId: string): Promise<SampleAccount> {
    if (userId !== actor.id && !HANDLERS.includes(actor.role)) {
      const below = actor.role === 'FIELD' && (await this.users.getDownline(actor.id)).some((u) => u.id === userId);
      if (!below) throw AppError.notFound('No such person.');
    }
    const [rows, given, user] = await Promise.all([this.requests.list({ userId }, 1000), this.given.givenBy(userId), this.users.findUserSummary(userId)]);
    const ids = new Set([...rows.flatMap((r) => r.lines.map((l) => l.productId)), ...given.samples.map((g) => g.productId), ...given.lbl.map((g) => g.productId)]);
    const names = new Map(await Promise.all([...ids].map(async (id) => [id, await productName(this.master, id)] as const)));
    const balance = buildBalance(rows, given, (id) => names.get(id) ?? 'Removed product');
    return { userId, userName: user?.name ?? '', ...balance, requests: await toViews(this.master, this.users, rows.slice(0, 50)) };
  }
}
