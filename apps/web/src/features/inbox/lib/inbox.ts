import {
  INBOX_KINDS,
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
export const BODY_MAX = 2000;

export interface MessageDraft {
  title: string;
  body: string;
  kind: InboxKind;
  everyone: boolean;
  roles: RoleName[];
  zoneIds: string[];
  hqIds: string[];
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
  expiresAt: '',
};

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
        userIds: [],
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

/** Same rules as the API, so the form catches them before sending. `now` is a parameter so the expiry rule is testable. */
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
    body:
      body === ''
        ? 'Write the message.'
        : body.length > BODY_MAX
          ? `Keep the message to ${BODY_MAX} characters.`
          : undefined,
    audience:
      !draft.everyone && !draft.roles.length && !draft.zoneIds.length && !draft.hqIds.length
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
