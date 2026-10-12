import type { RoleName } from './auth.js';

export const INBOX_KINDS = ['ANNOUNCEMENT', 'REMINDER', 'POLICY', 'UPDATE'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/**
 * Who a message goes to. `everyone`, or any mix of roles, Zones, HQs and named employees — a person
 * who matches any one of them gets it, once. Zones and HQs reach field employees only.
 */
export interface InboxAudienceDto {
  everyone: boolean;
  roles: RoleName[];
  zoneIds: string[];
  hqIds: string[];
  userIds: string[];
}

/** One row of `GET /inbox`: a message as one recipient sees it. */
export interface InboxItemDto {
  /** The message id — what `POST /inbox/:id/read` takes. */
  id: string;
  title: string;
  body: string;
  kind: InboxKind;
  /** When it was sent. */
  sentAt: string;
  /** After this the message disappears from the list; `null` = never. */
  expiresAt: string | null;
  read: boolean;
  readAt: string | null;
}

export interface InboxUnreadCountDto {
  unread: number;
}

/** Body of `POST /inbox/messages` (Admin). */
export interface PublishInboxMessageDto {
  title: string;
  body: string;
  kind: InboxKind;
  audience: InboxAudienceDto;
  expiresAt?: string | undefined;
}

/** One row of `GET /inbox/messages` (Admin): what was sent and how far it got. */
export interface SentInboxMessageDto {
  id: string;
  title: string;
  body: string;
  kind: InboxKind;
  audience: InboxAudienceDto;
  recipientCount: number;
  readCount: number;
  /** `null` for a message the system sent. */
  createdBy: string | null;
  sentAt: string;
  expiresAt: string | null;
  /** Set once the Admin took it back; recipients no longer see it. */
  retractedAt: string | null;
}
