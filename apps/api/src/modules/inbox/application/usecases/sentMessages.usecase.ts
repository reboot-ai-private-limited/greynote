import type { SentInboxMessageDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../../domain/inbox.repository.port.js';

/** Admin's side: what was sent and how far it got, and taking a message back. */
export class SentMessagesUseCases {
  constructor(
    private readonly messages: InboxMessageRepositoryPort,
    private readonly receipts: InboxReceiptRepositoryPort,
    private readonly now: () => Date = () => new Date(),
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
      recipientCount: m.recipientCount,
      readCount: reads.get(m.id) ?? 0,
      createdBy: m.createdBy,
      sentAt: m.createdAt.toISOString(),
      expiresAt: m.expiresAt?.toISOString() ?? null,
      retractedAt: m.retractedAt?.toISOString() ?? null,
    }));
    return buildPaginatedResult(rows, total, page);
  }

  /** Recipients stop seeing it at once (their copies are removed); the sent list keeps the record. */
  async retract(messageId: string): Promise<void> {
    const message = await this.messages.findById(messageId);
    if (!message) throw AppError.notFound('No such message.');
    if (message.retractedAt) throw AppError.conflict('That message was already taken back.');
    await this.messages.retract(messageId, this.now());
    await this.receipts.deleteForMessage(messageId);
  }
}
