import type {
  PaginatedDto,
  PublishInboxMessageDto,
  SentInboxMessageDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListSentQuery {
  page?: number | undefined;
  pageSize?: number | undefined;
}

export const inboxApi = {
  /** Admin: what was sent, newest first. */
  sent: (token: string, query: ListSentQuery, signal?: AbortSignal) =>
    request<PaginatedDto<SentInboxMessageDto>>('/inbox/messages', {
      token,
      query: { ...query },
      signal,
    }),
  publish: (token: string, body: PublishInboxMessageDto) =>
    request<{ id: string; recipientCount: number }>('/inbox/messages', {
      method: 'POST',
      token,
      body,
    }),
  retract: (token: string, id: string) =>
    request<null>(`/inbox/messages/${id}`, { method: 'DELETE', token }),
};
