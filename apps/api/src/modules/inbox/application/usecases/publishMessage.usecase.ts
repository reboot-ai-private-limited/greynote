import { randomUUID } from 'node:crypto';
import type { InboxAudienceDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import {
  ATTACHMENT_EXTENSION,
  ATTACHMENT_FILE_MESSAGE,
  ATTACHMENT_MIME,
  INBOX_ATTACHMENT_MAX_BYTES,
  INBOX_MAX_ATTACHMENTS,
  cleanFileName,
  detectAttachmentKind,
  resourceTypeOf,
  type InboxAttachment,
  type InboxAttachmentKind,
} from '../../domain/attachment.js';
import { isEmptyAudience, resolveAudience } from '../../domain/audience.js';
import type { InboxKind, InboxMessage } from '../../domain/inboxMessage.entity.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { AttachmentStoragePort, PushData, PushPort, RecipientDirectoryPort, TerritoryPort } from '../../domain/ports.js';

export interface PublishMessageInput {
  title: string;
  body: string;
  kind: InboxKind;
  audience: InboxAudienceDto;
  expiresAt?: Date | undefined;
  /** Files to send with it (the Admin's form); `name` is the uploaded file name. */
  files?: Array<{ buffer: Buffer; name: string }> | undefined;
  /** Sent with the push only (not stored): `type` and `route` for the phone. */
  data?: PushData | undefined;
  /** `false` keeps it in the Inbox without buzzing the phone. */
  push?: boolean | undefined;
}

const dedupe = (audience: InboxAudienceDto): InboxAudienceDto => ({
  everyone: audience.everyone,
  roles: [...new Set(audience.roles)],
  zoneIds: [...new Set(audience.zoneIds)],
  hqIds: [...new Set(audience.hqIds)],
  userIds: [...new Set(audience.userIds)],
});

/** A push carries a few lines at most (Firebase refuses over 4 KB); the full text is in the Inbox. */
export const PUSH_PREVIEW_CHARS = 180;
export function pushPreview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= PUSH_PREVIEW_CHARS ? flat : `${flat.slice(0, PUSH_PREVIEW_CHARS - 1).trimEnd()}…`;
}

/**
 * Sends a message: resolves the audience to people now, saves the message, and writes one receipt
 * per person (fan-out on write). `createdBy` is `null` for the system (`InboxNotifier`).
 * A message that reaches nobody is refused rather than saved empty. Files are checked (count, size, type from their
 * bytes) with everything else before any is uploaded; if an upload or the save fails, the files already stored go.
 */
export class PublishMessageUseCase {
  constructor(
    private readonly messages: InboxMessageRepositoryPort,
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly directory: RecipientDirectoryPort,
    private readonly territory: TerritoryPort,
    private readonly storage: AttachmentStoragePort | null = null,
    private readonly push: PushPort | null = null,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(input: PublishMessageInput, createdBy: string | null): Promise<InboxMessage> {
    const audience = dedupe(input.audience);
    if (isEmptyAudience(audience)) throw AppError.badRequest('Choose who this goes to.', { field: 'audience' });
    if (audience.everyone && (audience.roles.length || audience.zoneIds.length || audience.hqIds.length || audience.userIds.length)) {
      throw AppError.badRequest('“Everyone” can’t be combined with other choices.', { field: 'audience' });
    }
    const sentAt = this.now();
    if (input.expiresAt && input.expiresAt <= sentAt) throw AppError.badRequest('The expiry must be in the future.', { field: 'expiresAt' });

    for (const id of audience.zoneIds) {
      if ((await this.territory.getZone(id))?.status !== 'active') throw AppError.badRequest('A Zone in the audience doesn’t exist or is inactive.', { field: 'audience.zoneIds', id });
    }
    for (const id of audience.hqIds) {
      if ((await this.territory.getHq(id))?.status !== 'active') throw AppError.badRequest('An HQ in the audience doesn’t exist or is inactive.', { field: 'audience.hqIds', id });
    }

    const people = await this.directory.listActiveRecipients();
    const known = new Set(people.map((p) => p.id));
    const unknown = audience.userIds.filter((id) => !known.has(id));
    if (unknown.length) throw AppError.badRequest('Some of the named people aren’t active employees.', { field: 'audience.userIds', ids: unknown });

    const recipients = resolveAudience(audience, people);
    if (recipients.length === 0) throw AppError.badRequest('That audience has nobody in it.', { field: 'audience' });

    const files = this.checkFiles(input.files ?? []);
    const attachments = await this.store(files);
    const expiresAt = input.expiresAt ?? null;
    let message: InboxMessage;
    try {
      message = await this.messages.create({
        title: input.title,
        body: input.body,
        kind: input.kind,
        audience,
        attachments,
        recipientCount: recipients.length,
        createdBy,
        expiresAt,
      });
    } catch (err) {
      await this.discard(attachments);
      throw err;
    }
    const onReceipt = attachments.map(({ id, name, kind, sizeBytes, url }) => ({ id, name, kind, sizeBytes, url }));
    await this.receipts.insertMany(
      recipients.map((userId) => ({ messageId: message.id, userId, title: message.title, body: message.body, kind: message.kind, attachments: onReceipt, sentAt: message.createdAt, expiresAt, readAt: null })),
    );
    if (this.push && input.push !== false) {
      // After the receipts are saved: the Inbox row is the record, the push only a nudge, and it never fails the send.
      const body = attachments.length ? `📎 ${pushPreview(message.body)}` : pushPreview(message.body);
      await this.push.pushTo(recipients, { title: message.title, body, data: { type: 'INBOX', route: '/inbox', ...input.data, messageId: message.id } });
    }
    return message;
  }

  private checkFiles(files: Array<{ buffer: Buffer; name: string }>): Array<{ buffer: Buffer; name: string; kind: InboxAttachmentKind }> {
    if (files.length > INBOX_MAX_ATTACHMENTS) throw AppError.badRequest(`Attach at most ${INBOX_MAX_ATTACHMENTS} files.`, { field: 'files' });
    if (files.length > 0 && !this.storage) throw AppError.internal('INTERNAL', { reason: 'INBOX_STORAGE_NOT_CONFIGURED' });
    return files.map((f) => {
      if (f.buffer.length === 0) throw AppError.badRequest(`“${f.name}” is empty.`, { field: 'files', name: f.name });
      if (f.buffer.length > INBOX_ATTACHMENT_MAX_BYTES) throw AppError.badRequest(`“${f.name}” is over 10 MB.`, { field: 'files', name: f.name });
      const kind = detectAttachmentKind(f.buffer);
      if (!kind) throw AppError.badRequest(`“${f.name}”: ${ATTACHMENT_FILE_MESSAGE}`, { field: 'files', name: f.name, code: 'UNSUPPORTED_FILE' });
      return { ...f, kind };
    });
  }

  /** One at a time, so a failure leaves a known list to remove. */
  private async store(files: Array<{ buffer: Buffer; name: string; kind: InboxAttachmentKind }>): Promise<InboxAttachment[]> {
    const stored: InboxAttachment[] = [];
    try {
      for (const f of files) {
        const resourceType = resourceTypeOf(f.kind);
        const saved = await this.storage!.upload(f.buffer, { resourceType, extension: ATTACHMENT_EXTENSION[f.kind], mimeType: ATTACHMENT_MIME[f.kind] });
        stored.push({ id: this.newId(), name: cleanFileName(f.name, f.kind), kind: f.kind, sizeBytes: f.buffer.length, url: saved.url, publicId: saved.publicId, resourceType });
      }
    } catch (err) {
      await this.discard(stored);
      throw err;
    }
    return stored;
  }

  private async discard(attachments: InboxAttachment[]): Promise<void> {
    if (!this.storage) return;
    await Promise.allSettled(attachments.map((a) => this.storage!.remove(a.publicId, a.resourceType)));
  }
}
