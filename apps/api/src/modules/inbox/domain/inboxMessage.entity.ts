import type { InboxAudienceDto, InboxKind } from '@greynote/contracts';

export { INBOX_KINDS } from '@greynote/contracts';
export type { InboxKind } from '@greynote/contracts';

/** A message an Admin (or, for `createdBy: null`, the system) sent to an audience. */
export interface InboxMessage {
  id: string;
  title: string;
  body: string;
  kind: InboxKind;
  audience: InboxAudienceDto;
  recipientCount: number;
  createdBy: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  retractedAt: Date | null;
}
