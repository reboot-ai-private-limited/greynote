import type { SentInboxMessageDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { AttachmentStoragePort } from '../../domain/ports.js';
import { toAttachmentDto } from '../attachments.js';

/** Admin's side: what was sent and how far it got, and taking a message back. */
export class SentMessagesUseCases {
  constructor(
    private readonly messages: InboxMessageRepositoryPort,
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly storage: AttachmentStoragePort | null = null,
  ) {}

  async list(page: { page: number; pageSize: number }): Promise<PaginatedResult<SentInboxMessageDto>> {
    const { items, total } = await this.messages.list(page);
    const reads = await this.receipts.readCounts(items.map((m) => m.id));
    const rows = items.map((m) => ({
      id: m.id,
      title: m.title,
      body: m.body,
      kind: m.kind,
      audience: m.audience,
      // A taken-back message's files are deleted, so there is nothing left to open.
      attachments: m.retractedAt ? [] : m.attachments.map(toAttachmentDto),
      recipientCount: m.recipientCount,
      readCount: reads.get(m.id) ?? 0,
      createdBy: m.createdBy,
      sentAt: m.createdAt.toISOString(),
      expiresAt: m.expiresAt?.toISOString() ?? null,
      retractedAt: m.retractedAt?.toISOString() ?? null,
    }));
    return buildPaginatedResult(rows, total, page);
  }

  /**
   * Recipients stop seeing it at once (their copies are removed); the sent list keeps the record. Its files are
   * deleted too: nobody can reach them any more. A file the store fails to delete doesn't stop the take-back.
   */
  async retract(messageId: string): Promise<void> {
    const message = await this.messages.findById(messageId);
    if (!message) throw AppError.notFound('No such message.');
    if (message.retractedAt) throw AppError.conflict('That message was already taken back.');
    await this.messages.retract(messageId, this.now());
    await this.receipts.deleteForMessage(messageId);
    const storage = this.storage;
    if (storage) await Promise.allSettled(message.attachments.map((a) => storage.remove(a.publicId, a.resourceType)));
  }
}
