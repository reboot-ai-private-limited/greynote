import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { InboxMessage } from '../../domain/inboxMessage.entity.js';
import type { InboxReceipt } from '../../domain/inboxReceipt.entity.js';
import type { Recipient } from '../../domain/ports.js';
import { MyInboxUseCases } from './myInbox.usecase.js';
import { PublishMessageUseCase } from './publishMessage.usecase.js';
import { SentMessagesUseCases } from './sentMessages.usecase.js';

class FakeMessages implements InboxMessageRepositoryPort {
  rows: InboxMessage[] = [];
  async create(input: Omit<InboxMessage, 'id' | 'createdAt' | 'retractedAt'>) {
    const m = { ...input, id: `m${this.rows.length + 1}`, createdAt: new Date('2026-10-12T10:00:00Z'), retractedAt: null };
    this.rows.push(m);
    return m;
  }
  async findById(id: string) {
    return this.rows.find((m) => m.id === id) ?? null;
  }
  async list(page: { page: number; pageSize: number }) {
    return { items: [...this.rows].reverse().slice(0, page.pageSize), total: this.rows.length };
  }
  async retract(id: string, at: Date) {
    const m = this.rows.find((r) => r.id === id);
    if (!m || m.retractedAt) return false;
    m.retractedAt = at;
    return true;
  }
}
class FakeReceipts implements InboxReceiptRepositoryPort {
  rows: InboxReceipt[] = [];
  async insertMany(r: InboxReceipt[]) {
    this.rows.push(...r);
  }
  private mine(userId: string, now: Date, unreadOnly: boolean) {
    return this.rows.filter((r) => r.userId === userId && (!r.expiresAt || r.expiresAt > now) && (!unreadOnly || !r.readAt));
  }
  async listForUser(userId: string, f: { unreadOnly: boolean; now: Date }) {
    const items = this.mine(userId, f.now, f.unreadOnly);
    return { items, total: items.length };
  }
  async countUnread(userId: string, now: Date) {
    return this.mine(userId, now, true).length;
  }
  async markRead(userId: string, messageId: string, at: Date) {
    const r = this.rows.find((x) => x.userId === userId && x.messageId === messageId);
    if (!r) return false;
    r.readAt ??= at;
    return true;
  }
  async markAllRead(userId: string, at: Date) {
    const unread = this.rows.filter((r) => r.userId === userId && !r.readAt);
    unread.forEach((r) => (r.readAt = at));
    return unread.length;
  }
  async deleteForMessage(id: string) {
    this.rows = this.rows.filter((r) => r.messageId !== id);
  }
  async readCounts(ids: string[]) {
    return new Map(ids.map((id) => [id, this.rows.filter((r) => r.messageId === id && r.readAt).length]));
  }
}

const people: Recipient[] = [
  { id: 'mr1', role: 'FIELD', hqId: 'hq-a', zoneId: 'z1' },
  { id: 'mr2', role: 'FIELD', hqId: 'hq-b', zoneId: 'z2' },
  { id: 'hr1', role: 'HR', hqId: null, zoneId: null },
];
import type { InboxAudienceDto } from '@greynote/contracts';
const none: InboxAudienceDto = { everyone: false, roles: [], zoneIds: [], hqIds: [], userIds: [] };
const NOW = new Date('2026-10-12T12:00:00Z');

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('Inbox', () => {
  let messages: FakeMessages;
  let receipts: FakeReceipts;
  let publish: PublishMessageUseCase;
  let mine: MyInboxUseCases;
  let sent: SentMessagesUseCases;
  const page = { page: 1, pageSize: 20 };

  beforeEach(() => {
    messages = new FakeMessages();
    receipts = new FakeReceipts();
    const territory = {
      getZone: async (id: string) => (id.startsWith('z') ? { id, status: 'active' as const } : null),
      getHq: async (id: string) => (id.startsWith('hq') ? { id, status: 'active' as const } : null),
    };
    publish = new PublishMessageUseCase(messages, receipts, { listActiveRecipients: async () => people }, territory, () => NOW);
    mine = new MyInboxUseCases(receipts, () => NOW);
    sent = new SentMessagesUseCases(messages, receipts, () => NOW);
  });
  const send = (audience: Partial<InboxAudienceDto>, extra: { expiresAt?: Date } = {}) =>
    publish.execute({ title: 'Hello', body: 'Body', kind: 'ANNOUNCEMENT', audience: { ...none, ...audience }, ...extra }, 'admin');

  it('gives each person in the audience one copy', async () => {
    const m = await send({ zoneIds: ['z1'], roles: ['HR'] });
    expect(m.recipientCount).toBe(2);
    expect(await mine.unreadCount('mr1')).toBe(1);
    expect(await mine.unreadCount('hr1')).toBe(1);
    expect(await mine.unreadCount('mr2')).toBe(0);
  });

  it('refuses an empty audience, nobody in it, unknown places or people, and everyone-plus-more', async () => {
    await expectStatus(send({}), 400);
    await expectStatus(send({ zoneIds: ['z9'] }), 400); // active, but nobody there
    await expectStatus(send({ zoneIds: ['nope'] }), 400);
    await expectStatus(send({ userIds: ['ghost'] }), 400);
    await expectStatus(send({ everyone: true, roles: ['HR'] }), 400);
    expect(messages.rows).toHaveLength(0);
  });

  it('refuses an expiry in the past, and hides a message once it has expired', async () => {
    await expectStatus(send({ everyone: true }, { expiresAt: new Date('2026-10-12T11:00:00Z') }), 400);
    await send({ everyone: true }, { expiresAt: new Date('2026-10-12T12:30:00Z') });
    expect(await mine.unreadCount('mr1')).toBe(1);
    const later = new MyInboxUseCases(receipts, () => new Date('2026-10-12T13:00:00Z'));
    expect(await later.unreadCount('mr1')).toBe(0);
  });

  it('marks one or all as read, and only the person’s own copy', async () => {
    const a = await send({ everyone: true });
    await send({ everyone: true });
    await mine.markRead('mr1', a.id);
    expect(await mine.unreadCount('mr1')).toBe(1);
    expect(await mine.unreadCount('mr2')).toBe(2);
    expect((await mine.list('mr1', { unreadOnly: true }, page)).items).toHaveLength(1);
    expect(await mine.markAllRead('mr1')).toBe(1);
    await expectStatus(mine.markRead('mr1', 'unknown'), 404);
  });

  it('shows the Admin how far a message got, and takes it back', async () => {
    const m = await send({ everyone: true });
    await mine.markRead('mr1', m.id);
    const [row] = (await sent.list(page)).items;
    expect(row).toMatchObject({ recipientCount: 3, readCount: 1, retractedAt: null });
    await sent.retract(m.id);
    expect(await mine.unreadCount('mr2')).toBe(0);
    expect((await sent.list(page)).items[0]?.retractedAt).not.toBeNull();
    await expectStatus(sent.retract(m.id), 409);
    await expectStatus(sent.retract('unknown'), 404);
  });
});
