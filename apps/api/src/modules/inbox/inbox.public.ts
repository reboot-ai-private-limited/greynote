import type { InboxKind } from '@greynote/contracts';

export interface NotifyInput {
  title: string;
  body: string;
  kind: InboxKind;
  expiresAt?: Date | undefined;
}

/**
 * The only thing another module may import from `inbox/`. Sending to named people is how any other
 * module (a target set, a grant given, a call assigned) puts something in an inbox — the system is
 * the sender. Nothing calls it yet; sign-off F8 still has to say which events notify whom.
 */
export interface InboxPublicContract {
  /** Sends a system message to these active employees; returns how many it reached. */
  notify(userIds: string[], input: NotifyInput): Promise<number>;
}
