import { v7 as uuidv7 } from 'uuid';

/**
 * ID generation. UUID v7 where ordering matters — it encodes a millisecond timestamp in its
 * leading bits, so v7 IDs sort chronologically as strings, which is why it's worth the
 * dependency over `crypto.randomUUID` (v4 only).
 */

/**
 * A request correlation ID: `req_<uuid v7>`. Ordering matters here more than anywhere — these
 * are the keys log lines are grouped by, and a sortable ID means a log viewer puts a request's
 * lines in the order they happened. The `req_` prefix makes the ID self-describing when it
 * turns up pasted into a support message with no other context.
 */
export function newRequestId(): string {
  return `req_${uuidv7()}`;
}
