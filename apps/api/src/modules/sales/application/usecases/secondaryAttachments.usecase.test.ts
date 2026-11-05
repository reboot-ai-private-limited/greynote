import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeSale } from '../../domain/employeeSale.entity.js';
import type { EmployeeSaleRepositoryPort } from '../../domain/employeeSale.repository.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { SecondaryFileStoragePort } from '../../domain/proofStorage.port.js';
import type { SecondaryAttachment } from '../../domain/secondaryAttachment.entity.js';
import type { SecondaryAttachmentRepositoryPort } from '../../domain/secondaryAttachment.repository.port.js';
import { StockRefusal } from '../../domain/stockRefusal.js';
import { SalesClock } from '../salesClock.js';
import { AddSecondaryAttachmentUseCase, RemoveSecondaryAttachmentUseCase } from './secondaryAttachments.usecase.js';
import { FakeLines, FakeUsers, config } from './salesTestKit.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = Buffer.from('%PDF-1.4 hello');
const admin = { id: 'admin', role: 'ADMIN' as const };
const asm = { id: 'asm', role: 'FIELD' as const };
const mr1 = { id: 'mr1', role: 'FIELD' as const };
const mr2 = { id: 'mr2', role: 'FIELD' as const };
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof StockRefusal ? e.code : (e as Error).message));

class FakeFiles implements SecondaryAttachmentRepositoryPort {
  rows: SecondaryAttachment[] = [];
  failAdd = false;
  async add(input: Omit<SecondaryAttachment, 'id'>) {
    if (this.failAdd) throw new Error('db down');
    const row = { ...input, id: `f${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async list(userId: string, month: string) {
    return this.rows.filter((r) => r.userId === userId && r.month === month);
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async remove(id: string) {
    const n = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < n;
  }
}

class FakeStorage implements SecondaryFileStoragePort {
  uploaded: string[] = [];
  removed: string[] = [];
  async upload() {
    const publicId = `pub-${this.uploaded.length + 1}`;
    this.uploaded.push(publicId);
    return { url: `https://files/${publicId}`, publicId };
  }
  async remove(publicId: string) {
    this.removed.push(publicId);
  }
}

describe('secondary attachments (2026-11-02)', () => {
  let files: FakeFiles;
  let lines: FakeLines;
  let storage: FakeStorage;
  let status: EmployeeSale['secondaryStatus'] | null;
  let add: AddSecondaryAttachmentUseCase;
  let remove: RemoveSecondaryAttachmentUseCase;
  const file = (buffer: Buffer, name = 'shot.jpg') => ({ buffer, name });

  beforeEach(() => {
    files = new FakeFiles();
    lines = new FakeLines();
    storage = new FakeStorage();
    status = null;
    const sales = {
      async list() {
        return status ? [{ userId: 'mr1', month: '2026-10', secondaryQty: 5, secondaryStatus: status }] : [];
      },
    } as unknown as EmployeeSaleRepositoryPort;
    const stock = { async isUnlocked() { return false; } } as unknown as MonthlyStockRepositoryPort;
    const deps = { users: new FakeUsers(), sales, stock, lines, files, storage, clock: new SalesClock(config, () => new Date('2026-10-10T05:00:00Z')), config };
    add = new AddSecondaryAttachmentUseCase(deps);
    remove = new RemoveSecondaryAttachmentUseCase(deps);
  });

  it('attaches as many files as asked, each stored and recorded with its real type', async () => {
    for (let i = 0; i < 15; i++) await add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(i % 3 === 0 ? PDF : i % 3 === 1 ? PNG : JPEG, `p${i}.x`) });
    expect(files.rows).toHaveLength(15);
    expect(files.rows.map((r) => r.mimeType).slice(0, 3)).toEqual(['application/pdf', 'image/png', 'image/jpeg']);
    expect(storage.uploaded).toHaveLength(15);
    expect(files.rows[0]).toMatchObject({ userId: 'mr1', month: '2026-10', uploadedBy: 'mr1', fileName: 'p0.x' });
  });

  it('judges a file by its bytes, not its name, and refuses empty and oversize ones', async () => {
    expect(await code(add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(Buffer.from('MZ not an image'), 'virus.jpg') }))).toBe('INVALID_PAYLOAD');
    expect(await code(add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(Buffer.alloc(0)) }))).toBe('INVALID_PAYLOAD');
    expect(await code(add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)])) }))).toBe('INVALID_PAYLOAD');
    expect(files.rows).toHaveLength(0);
    expect(storage.uploaded).toHaveLength(0);
  });

  it('the employee, the manager above and Admin may attach; a colleague may not', async () => {
    const input = { userId: 'mr1', month: '2026-10', file: file(JPEG) };
    expect(await code(add.execute(mr1, input))).toBeNull();
    expect(await code(add.execute(asm, input))).toBeNull();
    expect(await code(add.execute(admin, input))).toBeNull();
    expect(await code(add.execute(mr2, input))).toBe('NOT_YOUR_TEAM');
  });

  it('the employee’s own files freeze while the month waits for approval or is approved; a draft or rejected one is open', async () => {
    const input = { userId: 'mr1', month: '2026-10', file: file(JPEG) };
    for (const s of ['DRAFT', 'REJECTED'] as const) {
      status = s;
      expect(await code(add.execute(mr1, input))).toBeNull();
    }
    for (const s of ['PENDING', 'APPROVED'] as const) {
      status = s;
      expect(await code(add.execute(mr1, input))).toBe('SECONDARY_LOCKED');
      expect(await code(add.execute(asm, input))).toBeNull(); // the approver's own word, as with the figures
    }
  });

  it('follows the figures’ window: not a future month, not after the deadline except Admin', async () => {
    expect(await code(add.execute(mr1, { userId: 'mr1', month: '2026-11', file: file(JPEG) }))).toBe('MONTH_NOT_STARTED');
    expect(await code(add.execute(mr1, { userId: 'mr1', month: '2026-08', file: file(JPEG) }))).toBe('MONTH_CLOSED');
    expect(await code(add.execute(admin, { userId: 'mr1', month: '2026-08', file: file(JPEG) }))).toBeNull();
  });

  it('takes the stored file down again when it cannot be recorded', async () => {
    files.failAdd = true;
    expect(await code(add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(JPEG) }))).toBe('db down');
    expect(storage.removed).toEqual(storage.uploaded);
  });

  it('removes a file and its stored copy, under the same rules; an unknown id is 404', async () => {
    await add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(JPEG) });
    await add.execute(mr1, { userId: 'mr1', month: '2026-10', file: file(PNG) });
    expect(await code(remove.execute(mr2, 'f1'))).toBe('NOT_YOUR_TEAM');
    status = 'PENDING';
    expect(await code(remove.execute(mr1, 'f1'))).toBe('SECONDARY_LOCKED');
    status = 'DRAFT';
    expect(await code(remove.execute(mr1, 'f1'))).toBeNull();
    expect(files.rows.map((r) => r.id)).toEqual(['f2']);
    expect(storage.removed).toEqual(['pub-1']);
    expect(await code(remove.execute(mr1, 'nope'))).toBe('ATTACHMENT_NOT_FOUND');
  });

  it('the proof is frozen for the MR once the per-distributor rows are sent or approved; the manager still may', async () => {
    const input = { userId: 'mr1', month: '2026-10', file: file(JPEG) };
    await lines.upsertMany('mr1', '2026-10', [{ distributorId: 'dist1', productId: 'prod1', openingQty: 0, primaryQty: 5, issuedQty: 1 }], 'PENDING', new Date());
    expect(await code(add.execute(mr1, input))).toBe('SECONDARY_LOCKED');
    expect(await code(add.execute(asm, input))).toBeNull();
    const [f] = files.rows;
    expect(await code(remove.execute(mr1, f!.id))).toBe('SECONDARY_LOCKED');
  });
});
