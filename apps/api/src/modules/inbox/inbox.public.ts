import type { InboxKind } from '@greynote/contracts';

export interface NotifyInput {
  title: string;
  body: string;
  kind: InboxKind;
  expiresAt?: Date | undefined;
  /** For the phone's push: `type` names the event, `route` the screen a tap opens. See docs/mobile/notifications.md. */
  data?: Record<string, string> | undefined;
  /** `false` writes the Inbox row without a push. */
  push?: boolean | undefined;
}

/**
 * The only thing another module may import from `inbox/`. Sending to named people is how any other
 * module (a target set, a grant given, a call assigned) puts something in an inbox — the system is
 * the sender. Every message also goes to the phone as a push when Firebase is set up (docs/LLD/notifications.md).
 */
export interface InboxPublicContract {
  /** Sends a system message to these active employees; returns how many it reached. */
  notify(userIds: string[], input: NotifyInput): Promise<number>;
}
