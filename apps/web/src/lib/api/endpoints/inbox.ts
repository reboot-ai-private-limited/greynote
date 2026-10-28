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
};
