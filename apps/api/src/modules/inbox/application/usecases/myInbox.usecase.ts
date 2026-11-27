import type { InboxItemDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { InboxReceipt } from '../../domain/inboxReceipt.entity.js';
import { toAttachmentDto } from '../attachments.js';

const toItem = (r: InboxReceipt, creators: Map<string, string | null>): InboxItemDto => ({
  id: r.messageId,
  title: r.title,
  body: r.body,
  kind: r.kind,
  sentAt: r.sentAt.toISOString(),
  expiresAt: r.expiresAt?.toISOString() ?? null,
  attachments: r.attachments.map(toAttachmentDto),
  read: r.readAt !== null,
  readAt: r.readAt?.toISOString() ?? null,
  // A message gone from the store reads as a notification (it can only be removed).
  source: creators.get(r.messageId) ? 'ADMIN' : 'SYSTEM',
  done: Boolean(r.doneAt),
});

/**
 * The signed-in person's own inbox — newest first, expired and retracted messages gone. Since 2026-11-27 a person tidies it: automatic
 * notifications can be removed (one, several, or all), while mail from Admin or HR is never removed — it is marked done and kept.
 */
export class MyInboxUseCases {
  constructor(
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly messages?: Pick<InboxMessageRepositoryPort, 'creatorsOf'>,
  ) {}

  async list(userId: string, filter: { unreadOnly: boolean; show?: 'active' | 'done' | undefined }, page: { page: number; pageSize: number }): Promise<PaginatedResult<InboxItemDto>> {
    const { items, total } = await this.receipts.listForUser(userId, { unreadOnly: filter.unreadOnly, now: this.now(), show: filter.show }, page);
    const creators = await this.creators(items.map((r) => r.messageId));
    return buildPaginatedResult(items.map((r) => toItem(r, creators)), total, page);
  }

  private async creators(ids: string[]): Promise<Map<string, string | null>> {
    return this.messages && ids.length > 0 ? this.messages.creatorsOf(ids) : new Map();
  }

  /** Removes these notifications from the person's inbox. Mail from Admin or HR is refused (mark it done instead). */
  async remove(userId: string, messageIds: string[]): Promise<number> {
    const creators = await this.creators(messageIds);
    const mail = messageIds.filter((id) => creators.get(id));
    if (mail.length > 0) throw AppError.badRequest('Mail from the office can’t be removed. Mark it done instead.', { field: 'ids', ids: mail });
    return this.receipts.removeForUser(userId, messageIds);
  }

  /** Removes every automatic notification from the person's inbox; their mail stays. */
  async clearNotifications(userId: string): Promise<number> {
    const ids = await this.receipts.messageIdsForUser(userId);
    const creators = await this.creators(ids);
    return this.receipts.removeForUser(userId, ids.filter((id) => !creators.get(id)));
  }

  /** Marks mail done (kept under "Done", counted as read), or back to not done. Only mail: a notification is removed instead. */
  async setDone(userId: string, messageIds: string[], done: boolean): Promise<number> {
    const creators = await this.creators(messageIds);
    const notMail = messageIds.filter((id) => !creators.get(id));
    if (notMail.length > 0) throw AppError.badRequest('Only mail is marked done; remove notifications instead.', { field: 'ids', ids: notMail });
    return this.receipts.setDone(userId, messageIds, done ? this.now() : null);
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
