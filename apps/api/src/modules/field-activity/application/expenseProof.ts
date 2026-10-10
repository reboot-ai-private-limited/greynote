import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { MAX_EXPENSE_ATTACHMENTS, MAX_EXPENSE_ATTACHMENT_BYTES, toAttachmentView, type ExpenseAttachmentView } from '../domain/expense.entity.js';
import { PROOF_FILE_MESSAGE, PROOF_MIME, cleanFileName, detectProofKind } from '../domain/proofFile.js';
import type { ProofStoragePort } from '../domain/proofStorage.port.js';
import type { ExpenseRepositoryPort } from '../domain/records.repository.port.js';
import type { ExpenseMonthService } from './usecases/expenseMonth.usecase.js';

/**
 * Proof on an "Other" expense: optional, at most 3 files of 5 MB each, a PDF, JPG or PNG (read from the file's own bytes). Only the
 * employee adds or removes it, and only while the expense can still be changed — the month not yet sent for approval, the row unpaid.
 * Approvers, the Accountant and Admin read it with the statement.
 */
export class ExpenseProof {
  constructor(
    private readonly expenses: ExpenseRepositoryPort,
    private readonly months: ExpenseMonthService,
    private readonly storage: ProofStoragePort,
  ) {}

  async add(userId: string, expenseId: string, file: { buffer: Buffer; name: string }): Promise<ExpenseAttachmentView[]> {
    const current = await this.expenses.findOtherById(expenseId, userId);
    if (!current) throw AppError.notFound('No such expense.');
    await this.months.assertEditable(userId, current.reportDate.slice(0, 7));
    if (file.buffer.length === 0) throw AppError.badRequest('That file is empty.', { field: 'file' });
    if (file.buffer.length > MAX_EXPENSE_ATTACHMENT_BYTES) throw AppError.badRequest('That file is over 5 MB.', { field: 'file' });
    const kind = detectProofKind(file.buffer);
    if (!kind) throw AppError.badRequest(PROOF_FILE_MESSAGE, { field: 'file' });
    // The cheap refusal first; the conditional update below is the real one, and it cleans up after itself.
    if (current.attachments.length >= MAX_EXPENSE_ATTACHMENTS) throw AppError.conflict(`An expense takes at most ${MAX_EXPENSE_ATTACHMENTS} files. Remove one first.`, { field: 'file' });

    const stored = await this.storage.upload(file.buffer, { userId, expenseId });
    const updated = await this.expenses.addAttachment(
      expenseId,
      userId,
      { url: stored.url, publicId: stored.publicId, fileName: cleanFileName(file.name), mimeType: PROOF_MIME[kind], sizeBytes: file.buffer.length, uploadedAt: new Date() },
      MAX_EXPENSE_ATTACHMENTS,
    );
    if (!updated) {
      await this.storage.remove(stored.publicId).catch((err: unknown) => logger.error({ err, publicId: stored.publicId }, 'could not remove an unattached expense proof file'));
      throw AppError.conflict(`This expense can no longer be changed, or already has ${MAX_EXPENSE_ATTACHMENTS} files.`, { field: 'file' });
    }
    return updated.attachments.map(toAttachmentView);
  }

  async remove(userId: string, expenseId: string, attachmentId: string): Promise<ExpenseAttachmentView[]> {
    const current = await this.expenses.findOtherById(expenseId, userId);
    if (!current) throw AppError.notFound('No such expense.');
    await this.months.assertEditable(userId, current.reportDate.slice(0, 7));
    const removed = await this.expenses.removeAttachment(expenseId, userId, attachmentId);
    if (!removed) throw AppError.notFound('No such file on this expense.');
    await this.storage.remove(removed.publicId).catch((err: unknown) => logger.error({ err, publicId: removed.publicId }, 'could not remove an expense proof file from storage'));
    return (await this.expenses.findOtherById(expenseId, userId))!.attachments.map(toAttachmentView);
  }
}
