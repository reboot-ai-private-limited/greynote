/**
 * A short memory of each user's built snapshots (2026-11-27). Building a snapshot runs a hundred or more queries, and phones pull after
 * every save and on every return to the app: a pull within `ttlMs` reuses what was built. A user's entries are forgotten when that user
 * pushes records, so their own changes always come back fresh; a change made by someone else (Admin, a manager) shows within `ttlMs`.
 * Per process, bounded (oldest dropped first).
 */
export class SnapshotCache {
  private readonly entries = new Map<string, { at: number; canonical: unknown; version: string }>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 5_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(userId: string, source: string): { canonical: unknown; version: string } | null {
    const key = `${userId}|${source}`;
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (this.now() - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return hit;
  }

  set(userId: string, source: string, value: { canonical: unknown; version: string }): void {
    const key = `${userId}|${source}`;
    this.entries.delete(key);
    this.entries.set(key, { ...value, at: this.now() });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }

  /** After this user pushed records: their next pull rebuilds everything. */
  forget(userId: string): void {
    for (const key of [...this.entries.keys()]) if (key.startsWith(`${userId}|`)) this.entries.delete(key);
  }
}
