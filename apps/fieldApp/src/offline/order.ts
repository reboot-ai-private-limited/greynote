import type { OutboxRecord } from './types';

/** Parents before children, otherwise the order made. Drops dependencies that aren't pending. */
export function orderForPush(records: OutboxRecord[]): OutboxRecord[] {
  const pending = new Map(records.map((r) => [r.clientId, r]));
  const done = new Set<string>();
  const ordered: OutboxRecord[] = [];
  const visit = (r: OutboxRecord, trail: Set<string>) => {
    if (done.has(r.clientId) || trail.has(r.clientId)) return; // a cycle is the server's INVALID_DEPENDENCY
    trail.add(r.clientId);
    for (const dep of r.dependsOn) {
      const parent = pending.get(dep);
      if (parent) visit(parent, trail);
    }
    trail.delete(r.clientId);
    done.add(r.clientId);
    ordered.push(r);
  };
  records.forEach((r) => visit(r, new Set()));
  return ordered;
}
