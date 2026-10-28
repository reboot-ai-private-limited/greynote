import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { InboxMessage } from '../../domain/inboxMessage.entity.js';
import type { InboxReceipt } from '../../domain/inboxReceipt.entity.js';
import type { AttachmentStoragePort, Recipient } from '../../domain/ports.js';
import { MyInboxUseCases } from './myInbox.usecase.js';
import { PUSH_PREVIEW_CHARS, PublishMessageUseCase } from './publishMessage.usecase.js';
import { PurgeSystemNotificationsUseCase } from './purgeSystemNotifications.usecase.js';
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
  async list(page: { page: number; pageSize: number }, filter: { source?: 'ADMIN' | 'SYSTEM' } = {}) {
    const rows = this.rows.filter((m) => !filter.source || (filter.source === 'SYSTEM') === (m.createdBy === null));
    return { items: [...rows].reverse().slice(0, page.pageSize), total: rows.length };
  }
  async findSystemIds(f: { before?: Date; limit: number }) {
    return this.rows.filter((m) => m.createdBy === null && (!f.before || m.createdAt < f.before)).slice(0, f.limit).map((m) => m.id);
  }
  async deleteMany(ids: string[]) {
    this.rows = this.rows.filter((m) => !ids.includes(m.id));
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
  async deleteForMessages(ids: string[]) {
    this.rows = this.rows.filter((r) => !ids.includes(r.messageId));
  }
  async readCounts(ids: string[]) {
    return new Map(ids.map((id) => [id, this.rows.filter((r) => r.messageId === id && r.readAt).length]));
  }
}

class FakeStorage implements AttachmentStoragePort {
  stored = new Map<string, 'image' | 'raw'>();
  failOn: number | null = null;
  private calls = 0;
  async upload(_file: Buffer, meta: { resourceType: 'image' | 'raw'; extension: string }) {
    if (++this.calls === this.failOn) throw new Error('cloudinary down');
    const publicId = `greynote/inbox/f${this.calls}${meta.resourceType === 'raw' ? `.${meta.extension}` : ''}`;
    this.stored.set(publicId, meta.resourceType);
    return { url: `https://res.cloudinary.com/demo/${meta.resourceType}/upload/v1/${publicId}`, publicId };
  }
  async remove(publicId: string, resourceType: 'image' | 'raw') {
    if (this.stored.get(publicId) === resourceType) this.stored.delete(publicId);
  }
}

const pdf = (name = 'Price list.pdf') => ({ buffer: Buffer.from('%PDF-1.7 body'), name });
const docx = (name = 'Form.docx') => ({ buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml word/document.xml')]), name });

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
  let storage: FakeStorage;
  let pushes: Array<{ userIds: string[]; body: string }>;
  const page = { page: 1, pageSize: 20 };

  beforeEach(() => {
    messages = new FakeMessages();
    receipts = new FakeReceipts();
    const territory = {
      getZone: async (id: string) => (id.startsWith('z') ? { id, status: 'active' as const } : null),
      getHq: async (id: string) => (id.startsWith('hq') ? { id, status: 'active' as const } : null),
    };
    storage = new FakeStorage();
    pushes = [];
    const push = { pushTo: async (userIds: string[], message: { title: string; body: string }) => void pushes.push({ userIds, body: message.body }) };
    let n = 0;
    publish = new PublishMessageUseCase(messages, receipts, { listActiveRecipients: async () => people }, territory, storage, push, () => NOW, () => `att-${++n}`);
    mine = new MyInboxUseCases(receipts, () => NOW);
    sent = new SentMessagesUseCases(messages, receipts, () => NOW, storage);
  });
  const send = (audience: Partial<InboxAudienceDto>, extra: { expiresAt?: Date; files?: Array<{ buffer: Buffer; name: string }>; body?: string } = {}) =>
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

  it('sends files with a message: each recipient sees them, with a download link', async () => {
    const m = await send({ userIds: ['mr1'] }, { files: [pdf(), docx()] });
    expect(m.attachments.map((a) => [a.kind, a.resourceType])).toEqual([['pdf', 'image'], ['docx', 'raw']]);
    const [item] = (await mine.list('mr1', { unreadOnly: false }, page)).items;
    expect(item?.attachments).toEqual([
      expect.objectContaining({ name: 'Price list.pdf', kind: 'pdf', sizeBytes: 13, downloadUrl: 'https://res.cloudinary.com/demo/image/upload/fl_attachment:Price_list/v1/greynote/inbox/f1' }),
      expect.objectContaining({ name: 'Form.docx', kind: 'docx', downloadUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/greynote/inbox/f2.docx' }),
    ]);
    expect(item?.attachments[0]).not.toHaveProperty('publicId');
    expect((await sent.list(page)).items[0]?.attachments).toHaveLength(2);
  });

  it('refuses a file of the wrong type, an empty one or too many, before uploading anything', async () => {
    await expectStatus(send({ everyone: true }, { files: [pdf(), { buffer: Buffer.from('MZ binary'), name: 'setup.exe' }] }), 400);
    await expectStatus(send({ everyone: true }, { files: [{ buffer: Buffer.alloc(0), name: 'empty.pdf' }] }), 400);
    await expectStatus(send({ everyone: true }, { files: Array.from({ length: 6 }, () => pdf()) }), 400);
    expect(storage.stored.size).toBe(0);
    expect(messages.rows).toHaveLength(0);
  });

  it('removes the files already stored when an upload or the save fails', async () => {
    storage.failOn = 2;
    await expect(send({ everyone: true }, { files: [pdf(), pdf()] })).rejects.toThrow('cloudinary down');
    expect(storage.stored.size).toBe(0);
    storage.failOn = null;
    messages.create = async () => {
      throw new Error('mongo down');
    };
    await expect(send({ everyone: true }, { files: [pdf()] })).rejects.toThrow('mongo down');
    expect(storage.stored.size).toBe(0);
  });

  it('deletes the files when a message is taken back', async () => {
    const m = await send({ everyone: true }, { files: [pdf(), docx()] });
    expect(storage.stored.size).toBe(2);
    await sent.retract(m.id);
    expect(storage.stored.size).toBe(0);
    expect((await sent.list(page)).items[0]?.attachments).toEqual([]);
  });

  it('takes a body of any length, and pushes only a short preview of it', async () => {
    const long = 'Dear team, '.repeat(2000);
    const m = await send({ userIds: ['mr1'] }, { body: long, files: [pdf()] });
    expect(m.body).toBe(long);
    expect((await mine.list('mr1', { unreadOnly: false }, page)).items[0]?.body).toBe(long);
    const pushed = pushes.at(-1)!.body;
    expect(pushed.startsWith('📎 Dear team,')).toBe(true);
    expect(pushed.length).toBeLessThanOrEqual(PUSH_PREVIEW_CHARS + 3);
    expect(pushed.endsWith('…')).toBe(true);
  });

  describe('system notifications', () => {
    const notify = (userIds: string[]) => publish.execute({ title: 'Approved', body: 'Done', kind: 'UPDATE', audience: { ...none, userIds } }, null);

    it('labels each sent row ADMIN or SYSTEM and filters by it', async () => {
      await send({ zoneIds: ['z1'] });
      await notify(['mr1']);
      expect((await sent.list(page)).items.map((r) => r.source)).toEqual(['SYSTEM', 'ADMIN']);
      expect((await sent.list(page, { source: 'SYSTEM' })).items).toHaveLength(1);
      expect((await sent.list(page, { source: 'ADMIN' })).items).toHaveLength(1);
    });

    it('deletes a system notification outright, and still keeps a taken-back Admin message', async () => {
      const sys = await notify(['mr1']);
      const mail = await send({ zoneIds: ['z1'] });
      await sent.retract(sys.id);
      await sent.retract(mail.id);
      expect(messages.rows.map((m) => m.id)).toEqual([mail.id]);
      expect(messages.rows[0]?.retractedAt).not.toBeNull();
      expect(receipts.rows.some((r) => r.messageId === sys.id)).toBe(false);
    });

    it('clears every system notification and leaves Admin mail', async () => {
      await notify(['mr1']);
      await notify(['mr2']);
      const mail = await send({ zoneIds: ['z1'] });
      expect(await sent.clearNotifications()).toBe(2);
      expect(messages.rows.map((m) => m.id)).toEqual([mail.id]);
      expect(receipts.rows.every((r) => r.messageId === mail.id)).toBe(true);
    });

    describe('retention job', () => {
      const purge = (days: string | null) =>
        new PurgeSystemNotificationsUseCase(messages, receipts, { get: async () => { if (days === null) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING' }); return days; } }, () => new Date(NOW.getTime() + 8 * 86_400_000));

      it('removes system notifications older than the setting only', async () => {
        await notify(['mr1']);
        const mail = await send({ zoneIds: ['z1'] });
        expect(await purge('7').run()).toEqual({ deleted: 1 });
        expect(messages.rows.map((m) => m.id)).toEqual([mail.id]);
      });

      it('keeps everything when the setting is 0, and uses 7 days when it was never seeded', async () => {
        await notify(['mr1']);
        expect(await purge('0').run()).toEqual({ deleted: 0 });
        expect(await purge(null).run()).toEqual({ deleted: 1 });
      });
    });
  });
});
