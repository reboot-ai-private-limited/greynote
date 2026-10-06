import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { MAX_LEAVE_ATTACHMENTS, MAX_LEAVE_ATTACHMENT_BYTES, type LeaveAttachment } from '../domain/leave.entity.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';
import { PROOF_FILE_MESSAGE, PROOF_MIME, cleanFileName, detectProofKind } from '../domain/proofFile.js';
import type { ProofStoragePort } from '../domain/proofStorage.port.js';

/** What the employee sees of a file: everything but the storage id. */
export type LeaveAttachmentView = Omit<LeaveAttachment, 'publicId'>;
export const toAttachmentView = ({ publicId: _publicId, ...rest }: LeaveAttachment): LeaveAttachmentView => rest;

/**
 * Proof on a leave (decision-log 2026-10-06): optional, only on a leave type that allows it, at most 3 files of 5 MB each, a PDF, JPG or PNG
 * (read from the file's own bytes). Only the employee adds or removes it; the approvers, HR and Admin read it with the leave. It can be added
 * after the leave is approved, since proof often comes later, and it survives an edit and resubmit.
 */
export class LeaveProof {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly types: LeaveTypeRepositoryPort,
    private readonly storage: ProofStoragePort,
  ) {}

  async add(userId: string, leaveId: string, file: { buffer: Buffer; name: string }): Promise<LeaveAttachmentView[]> {
    const leave = await this.leaves.findById(leaveId);
    if (!leave || leave.userId !== userId) throw AppError.notFound('No such leave.');
    const type = await this.types.findById(leave.leaveTypeId);
    if (!type?.allowsProof) throw AppError.badRequest('This kind of leave does not take proof.', { field: 'file' });
    if (file.buffer.length === 0) throw AppError.badRequest('That file is empty.', { field: 'file' });
    if (file.buffer.length > MAX_LEAVE_ATTACHMENT_BYTES) throw AppError.badRequest('That file is over 5 MB.', { field: 'file' });
    const kind = detectProofKind(file.buffer);
    if (!kind) throw AppError.badRequest(PROOF_FILE_MESSAGE, { field: 'file' });
    // The cheap refusal first; the conditional update below is the real one, and it cleans up after itself.
    if (leave.attachments.length >= MAX_LEAVE_ATTACHMENTS) throw AppError.conflict(`A leave takes at most ${MAX_LEAVE_ATTACHMENTS} files. Remove one first.`, { field: 'file' });

    const stored = await this.storage.upload(file.buffer, { userId, leaveId });
    const updated = await this.leaves.addAttachment(
      leaveId,
      { url: stored.url, publicId: stored.publicId, fileName: cleanFileName(file.name), mimeType: PROOF_MIME[kind], sizeBytes: file.buffer.length, uploadedAt: new Date() },
      MAX_LEAVE_ATTACHMENTS,
    );
    if (!updated) {
      await this.storage.remove(stored.publicId).catch((err: unknown) => logger.error({ err, publicId: stored.publicId }, 'could not remove an unattached leave proof file'));
      throw AppError.conflict(`A leave takes at most ${MAX_LEAVE_ATTACHMENTS} files. Remove one first.`, { field: 'file' });
    }
    return updated.attachments.map(toAttachmentView);
  }

  async remove(userId: string, leaveId: string, attachmentId: string): Promise<LeaveAttachmentView[]> {
    const leave = await this.leaves.findById(leaveId);
    if (!leave || leave.userId !== userId) throw AppError.notFound('No such leave.');
    const removed = await this.leaves.removeAttachment(leaveId, attachmentId);
    if (!removed) throw AppError.notFound('No such file on this leave.');
    await this.storage.remove(removed.publicId).catch((err: unknown) => logger.error({ err, publicId: removed.publicId }, 'could not remove a leave proof file from storage'));
    return (await this.leaves.findById(leaveId))!.attachments.map(toAttachmentView);
  }
}
