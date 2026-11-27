import type { InboxRecipientDto } from '@greynote/contracts';
import type {
  InboxSource,
  PaginatedDto,
  SentInboxMessageDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListSentQuery {
  page?: number | undefined;
  pageSize?: number | undefined;
  source?: InboxSource | undefined;
}

export const inboxApi = {
  /** Admin: what was sent, newest first. */
  sent: (token: string, query: ListSentQuery, signal?: AbortSignal) =>
    request<PaginatedDto<SentInboxMessageDto>>('/inbox/messages', {
      token,
      query: { ...query },
      signal,
    }),
  /** The message (and any files) as built by `messageForm`: JSON in `payload`, files in `files`. */
  publish: (token: string, body: FormData) =>
    request<{ id: string; recipientCount: number }>('/inbox/messages', {
      method: 'POST',
      token,
      body,
    }),
  /** Admin: deletes every automatic notification; Admin mail is untouched. */
  clearNotifications: (token: string) =>
    request<{ deleted: number }>('/inbox/messages/clear-notifications', { method: 'POST', token, body: {} }),
  retract: (token: string, id: string) =>
    request<null>(`/inbox/messages/${id}`, { method: 'DELETE', token }),
  /** Who a mail went to and when each opened it, not opened first (2026-11-27). */
  recipients: (token: string, id: string, signal?: AbortSignal) => request<InboxRecipientDto[]>(`/inbox/messages/${id}/recipients`, { token, signal }),
  /** A taken-back mail, deleted for good (2026-11-27). */
  deletePermanently: (token: string, id: string) => request<null>(`/inbox/messages/${id}/permanent`, { method: 'DELETE', token }),
};
