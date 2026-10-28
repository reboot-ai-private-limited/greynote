import type { InboxMessageRepositoryPort, InboxReceiptRepositoryPort } from '../domain/inbox.repository.port.js';

const BATCH = 500;

/**
 * Deletes system notifications (messages with no sender) and every recipient's copy, in batches; `before` limits it to
 * those sent earlier. Returns how many messages went. Safe to run twice, or on two servers at once.
 */
export async function clearSystemNotifications(messages: InboxMessageRepositoryPort, receipts: InboxReceiptRepositoryPort, before?: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const ids = await messages.findSystemIds({ ...(before && { before }), limit: BATCH });
    if (ids.length === 0) return total;
    await receipts.deleteForMessages(ids);
    await messages.deleteMany(ids);
    total += ids.length;
    if (ids.length < BATCH) return total;
  }
}
