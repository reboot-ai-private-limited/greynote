import type { InboxSource, SentInboxMessageDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { AttachmentStoragePort } from '../../domain/ports.js';
import { toAttachmentDto } from '../attachments.js';
import { clearSystemNotifications } from '../clearSystemNotifications.js';

/** Admin's side: what was sent and how far it got, and taking a message back. */
export class SentMessagesUseCases {
  constructor(
    private readonly messages: InboxMessageRepositoryPort,
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly storage: AttachmentStoragePort | null = null,
  ) {}

  async list(page: { page: number; pageSize: number }, filter: { source?: InboxSource } = {}): Promise<PaginatedResult<SentInboxMessageDto>> {
    const { items, total } = await this.messages.list(page, filter);
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
      source: m.createdBy === null ? ('SYSTEM' as const) : ('ADMIN' as const),
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
    // A system notification is clutter, not a record: clearing it removes it outright.
    if (message.createdBy === null) {
      await this.receipts.deleteForMessage(messageId);
      await this.messages.deleteMany([messageId]);
      return;
    }
    if (message.retractedAt) throw AppError.conflict('That message was already taken back.');
    await this.messages.retract(messageId, this.now());
    await this.receipts.deleteForMessage(messageId);
    const storage = this.storage;
    if (storage) await Promise.allSettled(message.attachments.map((a) => storage.remove(a.publicId, a.resourceType)));
  }

  /** Clears every system notification (or only those older than `olderThanDays`); admin mail is untouched. Returns how many went. */
  clearNotifications(olderThanDays?: number): Promise<number> {
    const before = olderThanDays === undefined ? undefined : new Date(this.now().getTime() - olderThanDays * 24 * 60 * 60 * 1000);
    return clearSystemNotifications(this.messages, this.receipts, before);
  }
}
