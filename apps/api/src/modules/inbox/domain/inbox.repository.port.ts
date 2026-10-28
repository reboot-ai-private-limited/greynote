import type { InboxSource } from '@greynote/contracts';
import type { InboxMessage } from './inboxMessage.entity.js';
import type { InboxReceipt } from './inboxReceipt.entity.js';

export interface InboxMessageRepositoryPort {
  create(input: Omit<InboxMessage, 'id' | 'createdAt' | 'retractedAt'>): Promise<InboxMessage>;
  findById(id: string): Promise<InboxMessage | null>;
  /** Newest first. `source` narrows to what an Admin sent (`ADMIN`) or what the system raised (`SYSTEM`, `createdBy: null`). */
  list(page: { page: number; pageSize: number }, filter?: { source?: InboxSource }): Promise<{ items: InboxMessage[]; total: number }>;
  /** `true` if this call retracted it, `false` if it was already retracted. */
  retract(id: string, at: Date): Promise<boolean>;
  /** Ids of system messages (optionally only those sent before `before`), oldest first, at most `limit`. */
  findSystemIds(filter: { before?: Date; limit: number }): Promise<string[]>;
  /** Removes the records themselves; unlike `retract`, nothing is kept in the sent list. */
  deleteMany(ids: string[]): Promise<void>;
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
  deleteForMessages(messageIds: string[]): Promise<void>;
  /** How many of each message's recipients have opened it. */
  readCounts(messageIds: string[]): Promise<Map<string, number>>;
}
