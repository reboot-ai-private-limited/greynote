import type { InboxKind } from '@greynote/contracts';
import type { ReceiptAttachment } from './attachment.js';

/**
 * One recipient's copy of a message, written when it is sent (fan-out on write). The text is copied
 * onto it so a person's inbox is a single indexed read, and so who a message reached never changes
 * when people later move HQ or change role.
 */
export interface InboxReceipt {
  messageId: string;
  userId: string;
  title: string;
  body: string;
  kind: InboxKind;
  attachments: ReceiptAttachment[];
  sentAt: Date;
  expiresAt: Date | null;
  readAt: Date | null;
}
