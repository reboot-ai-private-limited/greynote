import type { InboxItemDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { InboxReceipt } from '../../domain/inboxReceipt.entity.js';
import { toAttachmentDto } from '../attachments.js';

const toItem = (r: InboxReceipt): InboxItemDto => ({
  id: r.messageId,
  title: r.title,
  body: r.body,
  kind: r.kind,
  sentAt: r.sentAt.toISOString(),
  expiresAt: r.expiresAt?.toISOString() ?? null,
  attachments: r.attachments.map(toAttachmentDto),
  read: r.readAt !== null,
  readAt: r.readAt?.toISOString() ?? null,
});

/** The signed-in person's own inbox — newest first, expired and retracted messages gone. */
export class MyInboxUseCases {
  constructor(
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(userId: string, filter: { unreadOnly: boolean }, page: { page: number; pageSize: number }): Promise<PaginatedResult<InboxItemDto>> {
    const { items, total } = await this.receipts.listForUser(userId, { unreadOnly: filter.unreadOnly, now: this.now() }, page);
    return buildPaginatedResult(items.map(toItem), total, page);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.receipts.countUnread(userId, this.now());
  }

  async markRead(userId: string, messageId: string): Promise<void> {
    if (!(await this.receipts.markRead(userId, messageId, this.now()))) throw AppError.notFound('No such message in your inbox.');
  }

  async markAllRead(userId: string): Promise<number> {
    return this.receipts.markAllRead(userId, this.now());
  }
}
