import {
  INBOX_ATTACHMENT_MAX_BYTES,
  INBOX_KINDS,
  INBOX_MAX_ATTACHMENTS,
  ROLE_NAMES,
  type InboxAudienceDto,
  type InboxKind,
  type PublishInboxMessageDto,
  type RoleName,
} from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  ANNOUNCEMENT: 'Announcement',
  REMINDER: 'Reminder',
  POLICY: 'Policy',
  UPDATE: 'Update',
};
export const KIND_OPTIONS = INBOX_KINDS.map((k) => ({ value: k, label: INBOX_KIND_LABEL[k] }));

export const AUDIENCE_ROLE_LABEL: Record<RoleName, string> = {
  ADMIN: 'Admin',
  HR: 'HR',
  ACCOUNTANT: 'Accountant',
  FIELD: 'Field employees',
};
export const ROLE_OPTIONS = ROLE_NAMES.map((r) => ({ value: r, label: AUDIENCE_ROLE_LABEL[r] }));

export const TITLE_MAX = 120;

/** What the file picker offers; the API reads the real type from each file's bytes. */
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.pptx';
const ATTACHMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx', 'xlsx', 'pptx'];

/** A named person chosen in the form; the label is kept so the chip still reads right after the search changes. */
export interface ChosenPerson {
  id: string;
  label: string;
}

export interface MessageDraft {
  title: string;
  body: string;
  kind: InboxKind;
  everyone: boolean;
  roles: RoleName[];
  zoneIds: string[];
  hqIds: string[];
  people: ChosenPerson[];
  /** `YYYY-MM-DDTHH:mm` from a datetime-local input, in the browser's timezone; empty = never. */
  expiresAt: string;
}

export const EMPTY_MESSAGE: MessageDraft = {
  title: '',
  body: '',
  kind: 'ANNOUNCEMENT',
  everyone: true,
  roles: [],
  zoneIds: [],
  hqIds: [],
  people: [],
  expiresAt: '',
};

/** Adds the person, or takes them off if already chosen. */
export function togglePerson(people: readonly ChosenPerson[], person: ChosenPerson): ChosenPerson[] {
  return people.some((p) => p.id === person.id) ? people.filter((p) => p.id !== person.id) : [...people, person];
}

/**
 * The same limits as the API (at most 5 files, 10 MB each, PDF, pictures or Office files) so the form says so before
 * uploading. The type is judged by the extension here; the API checks the bytes.
 */
export function attachmentError(files: readonly File[]): string | undefined {
  if (files.length > INBOX_MAX_ATTACHMENTS) return `Attach at most ${INBOX_MAX_ATTACHMENTS} files.`;
  const wrong = files.find((f) => !ATTACHMENT_EXTENSIONS.includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
  if (wrong) return `“${wrong.name}” can’t be attached. Use a PDF, a picture (JPG, PNG, WebP), or a Word, Excel or PowerPoint file.`;
  const big = files.find((f) => f.size > INBOX_ATTACHMENT_MAX_BYTES);
  if (big) return `“${big.name}” is over 10 MB.`;
  const empty = files.find((f) => f.size === 0);
  return empty ? `“${empty.name}” is empty.` : undefined;
}

/** The multipart body `POST /inbox/messages` takes: the message as JSON in `payload`, the files in `files`. */
export function messageForm(body: PublishInboxMessageDto, files: readonly File[]): FormData {
  const form = new FormData();
  form.append('payload', JSON.stringify(body));
  for (const f of files) form.append('files', f, f.name);
  return form;
}

export function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function audienceOf(draft: MessageDraft): InboxAudienceDto {
  return draft.everyone
    ? { everyone: true, roles: [], zoneIds: [], hqIds: [], userIds: [] }
    : {
        everyone: false,
        roles: draft.roles,
        zoneIds: draft.zoneIds,
        hqIds: draft.hqIds,
        userIds: draft.people.map((p) => p.id),
      };
}

/** "Everyone", or the parts chosen: "Field employees · 2 zones · 1 HQ · 3 people". */
export function describeAudience(a: InboxAudienceDto): string {
  if (a.everyone) return 'Everyone';
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    ...a.roles.map((r) => AUDIENCE_ROLE_LABEL[r]),
    ...(a.zoneIds.length ? [plural(a.zoneIds.length, 'zone', 'zones')] : []),
    ...(a.hqIds.length ? [plural(a.hqIds.length, 'HQ', 'HQs')] : []),
    ...(a.userIds.length ? [plural(a.userIds.length, 'person', 'people')] : []),
  ].join(' · ');
}

/**
 * Same rules as the API, so the form catches them before sending. The message has no length limit (2026-10-22).
 * `now` is a parameter so the expiry rule is testable.
 */
export function buildMessage(
  draft: MessageDraft,
  now: Date = new Date(),
): BuildResult<PublishInboxMessageDto> {
  const title = squash(draft.title);
  const body = draft.body.trim();
  const expires = draft.expiresAt === '' ? null : new Date(draft.expiresAt);
  const errors = {
    title:
      title === ''
        ? 'Enter a title.'
        : title.length > TITLE_MAX
          ? `Keep the title to ${TITLE_MAX} characters.`
          : undefined,
    body: body === '' ? 'Write the message.' : undefined,
    audience:
      !draft.everyone &&
      !draft.roles.length &&
      !draft.zoneIds.length &&
      !draft.hqIds.length &&
      !draft.people.length
        ? 'Choose who this goes to.'
        : undefined,
    expiresAt:
      expires && (Number.isNaN(expires.getTime()) || expires <= now)
        ? 'Choose a time in the future.'
        : undefined,
  };
  if (Object.values(errors).some(Boolean)) return fail(errors);
  return {
    ok: true,
    body: {
      title,
      body,
      kind: draft.kind,
      audience: audienceOf(draft),
      ...(expires && { expiresAt: expires.toISOString() }),
    },
  };
}
