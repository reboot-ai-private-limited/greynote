import type { InboxMessage } from './inboxMessage.entity.js';
import type { InboxReceipt } from './inboxReceipt.entity.js';

export interface InboxMessageRepositoryPort {
  create(input: Omit<InboxMessage, 'id' | 'createdAt' | 'retractedAt'>): Promise<InboxMessage>;
  findById(id: string): Promise<InboxMessage | null>;
  /** Newest first. */
  list(page: { page: number; pageSize: number }): Promise<{ items: InboxMessage[]; total: number }>;
  /** `true` if this call retracted it, `false` if it was already retracted. */
  retract(id: string, at: Date): Promise<boolean>;
}

export interface InboxReceiptRepositoryPort {
  insertMany(receipts: InboxReceipt[]): Promise<void>;
  /** Newest first; never an expired message. */
  listForUser(userId: string, filter: { unreadOnly: boolean; now: Date }, page: { page: number; pageSize: number }): Promise<{ items: InboxReceipt[]; total: number }>;
  countUnread(userId: string, now: Date): Promise<number>;
  /** `false` if this person has no such message; reading one already read is fine. */
  markRead(userId: string, messageId: string, at: Date): Promise<boolean>;
  markAllRead(userId: string, at: Date): Promise<number>;
  deleteForMessage(messageId: string): Promise<void>;
  /** How many of each message's recipients have opened it. */
  readCounts(messageIds: string[]): Promise<Map<string, number>>;
}
