import type { SyncRecordInput } from '../domain/syncRecord.js';

export interface Ordered {
  /** Records in the order to apply them: parents before children, otherwise as sent. */
  order: SyncRecordInput[];
  /** Records that can't be applied: they depend on something that isn't in the batch or already synced, or on each other in a loop. */
  invalid: Map<string, string>;
}

/**
 * Dependency order (LLD sync.md, Push). A dependency is satisfied by another record in this batch,
 * or by one already synced (`known`) — a retried Submit sends the whole day again, but a later
 * batch may depend on records an earlier one delivered. Ties keep the order the phone sent.
 */
export function orderRecords(records: SyncRecordInput[], known: ReadonlySet<string>): Ordered {
  const byId = new Map(records.map((r) => [r.clientId, r]));
  const invalid = new Map<string, string>();

  for (const r of records) {
    const missing = r.dependsOn.filter((d) => !byId.has(d) && !known.has(d));
    if (missing.length > 0) invalid.set(r.clientId, `Depends on a record that wasn't sent or synced: ${missing.join(', ')}.`);
    if (r.dependsOn.includes(r.clientId)) invalid.set(r.clientId, 'A record can’t depend on itself.');
  }

  // Kahn's algorithm over the batch's own edges; whatever is left is in a loop or hangs off one.
  const pending = new Map<string, Set<string>>();
  for (const r of records) pending.set(r.clientId, new Set(r.dependsOn.filter((d) => byId.has(d) && d !== r.clientId)));
  const order: SyncRecordInput[] = [];
  const done = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const r of records) {
      if (done.has(r.clientId)) continue;
      const waiting = [...(pending.get(r.clientId) ?? [])].filter((d) => !done.has(d));
      if (waiting.length === 0) {
        done.add(r.clientId);
        order.push(r);
        progressed = true;
      }
    }
  }
  for (const r of records) {
    if (!done.has(r.clientId) && !invalid.has(r.clientId)) invalid.set(r.clientId, 'These records depend on each other in a loop.');
  }
  return { order: order.filter((r) => !invalid.has(r.clientId)), invalid };
}
