import type { ApprovalInboxItemDto, PaginatedDto } from '@greynote/contracts';
import { request } from '../client';

export interface InboxQuery {
  kind?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export const approvalsApi = {
  /** Admin sees every open request; HR only those it can finalize (leave). */
  inbox: (token: string, query: InboxQuery, signal?: AbortSignal) =>
    request<PaginatedDto<ApprovalInboxItemDto>>('/approvals/inbox', { token, query: { ...query }, signal }),
};
