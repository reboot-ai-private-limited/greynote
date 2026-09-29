import { createHash } from 'node:crypto';

/**
 * A JSON-safe copy with object keys in sorted order and dates as ISO strings, so equal data always
 * serialises to the same text. Array order is kept — it is the source's job to sort its lists.
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** A snapshot's version: the SHA-1 of its canonical JSON — equal exactly when the content is. */
export function versionOf(canonical: unknown): string {
  return createHash('sha1').update(JSON.stringify(canonical)).digest('hex');
}
