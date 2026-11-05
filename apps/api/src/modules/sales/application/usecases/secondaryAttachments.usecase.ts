import { logger } from '@/shared/logging/logger.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { PROOF_FILE_MESSAGE, PROOF_MIME, cleanFileName, detectProofKind } from '../../domain/proofFile.js';
import type { SecondaryFileStoragePort } from '../../domain/proofStorage.port.js';
import type { EmployeeSaleRepositoryPort } from '../../domain/employeeSale.repository.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import { MAX_SECONDARY_ATTACHMENT_BYTES, type SecondaryAttachment } from '../../domain/secondaryAttachment.entity.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import type { SecondaryAttachmentRepositoryPort } from '../../domain/secondaryAttachment.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';
import type { SalesLateGate } from '../../domain/salesLateGate.port.js';
import { assertMayAct, assertMonthOpenForEntry } from './employeeAccess.js';

interface Deps {
  users: UserDirectoryPort;
  sales: EmployeeSaleRepositoryPort;
  stock: MonthlyStockRepositoryPort;
  files: SecondaryAttachmentRepositoryPort;
  /** MRs' per-distributor rows (2026-11-05): a month they have sent or had approved freezes the proof like the older entry does. */
  lines?: SecondaryStockLineRepositoryPort | undefined;
  storage: SecondaryFileStoragePort;
  clock: SalesClock;
  config: ConfigReader;
  late?: SalesLateGate | undefined;
}

/**
 * Who may change a month's files, and when: whoever may enter that employee's figures (the employee, the manager above, Admin), inside the same
 * window as the figures. The employee's own files are also frozen once the month waits for, or has, its manager's approval; a manager or Admin
 * working for them is the approver's own word, as with the figures.
 */
async function assertMayChange(d: Deps, actor: Actor, userId: string, month: string): Promise<void> {
  await assertMayAct(d.users, actor, userId);
  await assertMonthOpenForEntry(d, actor, month, userId);
  if (actor.id !== userId) return;
  const rows = await d.sales.list({ userIds: [userId], fromMonth: month, toMonth: month }, 5000);
  const held = (await d.lines?.listByUser(userId, month))?.find((r) => r.status === 'PENDING' || r.status === 'APPROVED');
  if (held) throw new StockRefusal(STOCK_CODES.secondaryLocked, `This month is ${held.status === 'PENDING' ? 'waiting for approval' : 'approved'}. Withdraw it, or ask your manager to reopen it, before changing its files.`);
  const locked = rows.find((r) => r.secondaryQty !== null && (r.secondaryStatus === 'PENDING' || r.secondaryStatus === 'APPROVED'));
  if (locked) {
    throw new StockRefusal(STOCK_CODES.secondaryLocked, `This month is ${locked.secondaryStatus === 'PENDING' ? 'waiting for approval' : 'approved'}. Withdraw it, or ask your manager to reopen it, before changing its files.`);
  }
}

/** Adds one file to a month's secondary. No limit on how many; each is a PDF, JPG or PNG of at most 5 MB, judged by its own bytes. */
export class AddSecondaryAttachmentUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { userId: string; month: string; file: { buffer: Buffer; name: string } }): Promise<SecondaryAttachment> {
    const { buffer, name } = input.file;
    if (buffer.length === 0) throw new StockRefusal(STOCK_CODES.invalidPayload, 'That file is empty.');
    if (buffer.length > MAX_SECONDARY_ATTACHMENT_BYTES) throw new StockRefusal(STOCK_CODES.invalidPayload, 'That file is over 5 MB.');
    const kind = detectProofKind(buffer);
    if (!kind) throw new StockRefusal(STOCK_CODES.invalidPayload, PROOF_FILE_MESSAGE);
    await assertMayChange(this.deps, actor, input.userId, input.month);

    const stored = await this.deps.storage.upload(buffer, { userId: input.userId, month: input.month });
    try {
      return await this.deps.files.add({
        userId: input.userId,
        month: input.month,
        url: stored.url,
        publicId: stored.publicId,
        fileName: cleanFileName(name),
        mimeType: PROOF_MIME[kind],
        sizeBytes: buffer.length,
        uploadedBy: actor.id,
        uploadedAt: this.deps.clock.now(),
      });
    } catch (err) {
      // The file is up but unrecorded: take it down rather than leave it orphaned.
      await this.deps.storage.remove(stored.publicId).catch((e: unknown) => logger.error({ err: e, publicId: stored.publicId }, 'could not remove an unrecorded secondary file'));
      throw err;
    }
  }
}

/** Removes one file, under the same rules as adding it. The stored file goes too. */
export class RemoveSecondaryAttachmentUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, id: string): Promise<void> {
    const file = await this.deps.files.findById(id);
    if (!file) throw new StockRefusal(STOCK_CODES.attachmentNotFound, 'No such file.');
    await assertMayChange(this.deps, actor, file.userId, file.month);
    await this.deps.files.remove(id);
    await this.deps.storage.remove(file.publicId).catch((e: unknown) => logger.error({ err: e, publicId: file.publicId }, 'could not remove a secondary file from storage'));
  }
}
