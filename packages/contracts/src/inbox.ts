import type { RoleName } from './auth.js';

export const INBOX_KINDS = ['ANNOUNCEMENT', 'REMINDER', 'POLICY', 'UPDATE'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** Who raised a message: an Admin (mail, can be taken back) or the system (an automatic notification, cleared or auto-deleted). */
export const INBOX_SOURCES = ['ADMIN', 'SYSTEM'] as const;
export type InboxSource = (typeof INBOX_SOURCES)[number];

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

/** What an inbox attachment may be; the API reads the type from the file's own bytes. */
export const INBOX_ATTACHMENT_KINDS = ['pdf', 'jpeg', 'png', 'webp', 'docx', 'xlsx', 'pptx'] as const;
export type InboxAttachmentKind = (typeof INBOX_ATTACHMENT_KINDS)[number];
/** At most this many files on one message, each at most `INBOX_ATTACHMENT_MAX_BYTES`. */
export const INBOX_MAX_ATTACHMENTS = 5;
export const INBOX_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** A file sent with a message. */
export interface InboxAttachmentDto {
  id: string;
  /** The name it was uploaded with, e.g. `Price list Oct.pdf`. */
  name: string;
  kind: InboxAttachmentKind;
  sizeBytes: number;
  /** Opens the file (a PDF or image shows in the browser or viewer). */
  url: string;
  /** Saves the file under its name instead of opening it. Same as `url` for Word, Excel and PowerPoint, which always download. */
  downloadUrl: string;
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
  /** Files sent with it; empty for most messages. */
  attachments: InboxAttachmentDto[];
  read: boolean;
  readAt: string | null;
}

export interface InboxUnreadCountDto {
  unread: number;
}

/**
 * Body of `POST /inbox/messages` (Admin): JSON, or `multipart/form-data` with this object as JSON in a `payload` field and
 * up to `INBOX_MAX_ATTACHMENTS` files in `files`. The body has no length limit of its own.
 */
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
  attachments: InboxAttachmentDto[];
  recipientCount: number;
  readCount: number;
  /** `null` for a message the system sent. */
  createdBy: string | null;
  /** `SYSTEM` when `createdBy` is `null`. */
  source: InboxSource;
  sentAt: string;
  expiresAt: string | null;
  /** Set once the Admin took it back; recipients no longer see it. */
  retractedAt: string | null;
}
