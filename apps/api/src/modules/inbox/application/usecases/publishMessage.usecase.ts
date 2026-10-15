import type { InboxAudienceDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { isEmptyAudience, resolveAudience } from '../../domain/audience.js';
import type { InboxKind, InboxMessage } from '../../domain/inboxMessage.entity.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';
import type { PushData, PushPort, RecipientDirectoryPort, TerritoryPort } from '../../domain/ports.js';

export interface PublishMessageInput {
  title: string;
  body: string;
  kind: InboxKind;
  audience: InboxAudienceDto;
  expiresAt?: Date | undefined;
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

/**
 * Sends a message: resolves the audience to people now, saves the message, and writes one receipt
 * per person (fan-out on write). `createdBy` is `null` for the system (`InboxNotifier`).
 * A message that reaches nobody is refused rather than saved empty.
 */
export class PublishMessageUseCase {
  constructor(
    private readonly messages: InboxMessageRepositoryPort,
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly directory: RecipientDirectoryPort,
    private readonly territory: TerritoryPort,
    private readonly push: PushPort | null = null,
    private readonly now: () => Date = () => new Date(),
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

    const expiresAt = input.expiresAt ?? null;
    const message = await this.messages.create({
      title: input.title,
      body: input.body,
      kind: input.kind,
      audience,
      recipientCount: recipients.length,
      createdBy,
      expiresAt,
    });
    await this.receipts.insertMany(
      recipients.map((userId) => ({ messageId: message.id, userId, title: message.title, body: message.body, kind: message.kind, sentAt: message.createdAt, expiresAt, readAt: null })),
    );
    if (this.push && input.push !== false) {
      // After the receipts are saved: the Inbox row is the record, the push only a nudge, and it never fails the send.
      await this.push.pushTo(recipients, { title: message.title, body: message.body, data: { type: 'INBOX', route: '/inbox', ...input.data, messageId: message.id } });
    }
    return message;
  }
}
