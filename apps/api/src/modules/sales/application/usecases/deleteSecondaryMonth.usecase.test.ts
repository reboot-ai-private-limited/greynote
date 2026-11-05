import { beforeEach, describe, expect, it } from 'vitest';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { SecondaryAttachment } from '../../domain/secondaryAttachment.entity.js';
import type { SecondaryAttachmentRepositoryPort } from '../../domain/secondaryAttachment.repository.port.js';
import { SalesClock } from '../salesClock.js';
import { DeleteSecondaryMonthUseCase } from './deleteSecondaryMonth.usecase.js';
import { FakeLines, FakeRollups, FakeStock, config } from './salesTestKit.js';
import { makeSecondaryRollupStatusHandler } from './secondaryRollup.usecase.js';
import { makeSecondaryStockStatusHandler } from './secondaryStock.usecase.js';

const admin = { id: 'admin', role: 'ADMIN' };
const now = new Date('2026-09-30T10:00:00+05:30');
const proof = (userId: string): SecondaryAttachment => ({ id: 'f1', userId, month: '2026-09', url: 'https://files/f1', publicId: 'p1', fileName: 'statement.jpg', mimeType: 'image/jpeg', sizeBytes: 10, uploadedBy: userId, uploadedAt: now });

describe('Admin deleting a month of secondary sales', () => {
  const run = { run: <T>(fn: (ctx: undefined) => Promise<T>) => fn(undefined) };
  let lines: FakeLines;
  let rollups: FakeRollups;
  let removedRequests: string[];
  let removedFiles: string[];
  let stored: string[];
  let del: DeleteSecondaryMonthUseCase;
  const files: SecondaryAttachment[] = [];

  beforeEach(async () => {
    lines = new FakeLines();
    rollups = new FakeRollups();
    removedRequests = [];
    removedFiles = [];
    stored = [];
    files.length = 0;
    files.push(proof('asm'));
    const approvals = {
      getForRecord: async (kind: string, recordId: string) => (recordId.endsWith(':team') || recordId === 'mr1:2026-09' ? { id: `rq-${recordId}`, kind, recordId, status: 'SUBMITTED' } : null),
      deleteForRecord: async (kind: string, recordId: string) => void removedRequests.push(`${kind}:${recordId}`),
    } as unknown as SalesApprovalsPort;
    const fileRepo: SecondaryAttachmentRepositoryPort = {
      add: async () => proof('x'),
      list: async (u: string) => files.filter((f) => f.userId === u),
      findById: async () => null,
      remove: async (id: string) => (removedFiles.push(id), true),
    };
    del = new DeleteSecondaryMonthUseCase(new FakeStock(), approvals, run, new SalesClock(config, () => now), config, lines, rollups, fileRepo, { remove: async (id: string) => void stored.push(id) } as never);
    await lines.upsertMany('mr1', '2026-09', [{ distributorId: 'dist1', productId: 'prod1', openingQty: 1, primaryQty: 2, issuedQty: 1 }], 'APPROVED', now);
    await rollups.save({ userId: 'asm', month: '2026-09', status: 'APPROVED', requestId: 'rq', designation: { name: 'ASM', level: 2 }, lines: [], sources: [], submittedAt: now, approvedAt: now });
  });

  it('removes an MR’s rows and both request records, and is Admin only', async () => {
    await expect(del.execute({ id: 'asm', role: 'FIELD' }, { userId: 'mr1', month: '2026-09' })).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
    expect(await del.preview(admin, { userId: 'mr1', month: '2026-09' })).toEqual({ distributors: 1, lines: 1, requestWaiting: true });
    expect(await del.execute(admin, { userId: 'mr1', month: '2026-09' })).toMatchObject({ distributors: 1, lines: 1, requestRemoved: true });
    expect(await lines.listByUser('mr1', '2026-09')).toEqual([]);
    expect(removedRequests).toEqual(['SECONDARY_SALES:mr1:2026-09', 'SECONDARY_SALES:mr1:2026-09:team']);
  });

  it('removes a manager’s team report with its files, in storage too', async () => {
    expect(await del.execute(admin, { userId: 'asm', month: '2026-09' })).toMatchObject({ files: 1, requestRemoved: true });
    expect(await rollups.find('asm', '2026-09')).toBeNull();
    expect(removedFiles).toEqual(['f1']);
    expect(stored).toEqual(['p1']);
    await expect(del.execute(admin, { userId: 'asm', month: '2026-10' })).rejects.toMatchObject({ code: 'MONTH_NOT_STARTED' });
  });

  it('one status handler per record shape: a team record never touches an MR’s rows', async () => {
    await lines.setStatus({ userId: 'mr1', month: '2026-09' }, ['APPROVED'], 'PENDING');
    await rollups.setStatus({ userId: 'asm', month: '2026-09' }, ['APPROVED'], 'PENDING');
    await makeSecondaryRollupStatusHandler(rollups, () => now)({ recordId: 'mr1:2026-09', status: 'APPROVED' }, undefined as never);
    expect((await rollups.find('asm', '2026-09'))!.status).toBe('PENDING');
    await makeSecondaryStockStatusHandler(lines)({ recordId: 'asm:2026-09:team', status: 'APPROVED' }, undefined as never);
    expect((await lines.listByUser('mr1', '2026-09'))[0]!.status).toBe('PENDING');
    await makeSecondaryRollupStatusHandler(rollups, () => now)({ recordId: 'asm:2026-09:team', status: 'APPROVED' }, undefined as never);
    expect((await rollups.find('asm', '2026-09'))!.status).toBe('APPROVED');
    await makeSecondaryStockStatusHandler(lines)({ recordId: 'mr1:2026-09', status: 'APPROVED' }, undefined as never);
    expect((await lines.listByUser('mr1', '2026-09'))[0]!.status).toBe('APPROVED');
  });
});
