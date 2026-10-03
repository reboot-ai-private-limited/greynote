import type {
  ApprovalDetailDto,
  ApprovalInboxItemDto,
  ApprovalStatus,
  ApproveDto,
  BulkDecideDto,
  BulkDecideResponseDto,
  PaginatedDto,
  RejectDto,
  ReopenDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface InboxQuery {
  kind?: string | undefined;
  status?: ApprovalStatus | undefined;
  submitterId?: string | undefined;
  /** Admin only: requests from this manager's direct reports. */
  managerId?: string | undefined;
  /** ISO date-times WITH an offset (`2026-09-28T23:59:59.999+05:30`), both inclusive, on `submittedAt`. A bare date is a 400. */
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export const approvalsApi = {
  /** Open requests the caller can act on, oldest first. Admin sees every open request; HR only those it can finalize (leave). */
  inbox: (token: string, query: InboxQuery, signal?: AbortSignal) =>
    request<PaginatedDto<ApprovalInboxItemDto>>('/approvals/inbox', { token, query: { ...query }, signal }),

  /** The History: any status, newest first. Admin sees all; HR sees leave. */
  all: (token: string, query: InboxQuery, signal?: AbortSignal) =>
    request<PaginatedDto<ApprovalInboxItemDto>>('/approvals/all', { token, query: { ...query }, signal }),

  detail: (token: string, id: string, signal?: AbortSignal) =>
    request<ApprovalDetailDto>(`/approvals/${id}`, { token, signal }),

  approve: (token: string, id: string, body: ApproveDto) =>
    request<{ id: string; status: string }>(`/approvals/${id}/approve`, { method: 'POST', token, body }),
  reject: (token: string, id: string, body: RejectDto) =>
    request<{ id: string; status: string }>(`/approvals/${id}/reject`, { method: 'POST', token, body }),
  /** Admin only, from Approved only. */
  reopen: (token: string, id: string, body: ReopenDto) =>
    request<{ id: string; status: string }>(`/approvals/${id}/reopen`, { method: 'POST', token, body }),

  /** Up to 100, each decided on its own: the response always carries a result per request, never a bare failure. */
  bulk: (token: string, body: BulkDecideDto) =>
    request<BulkDecideResponseDto>('/approvals/bulk', { method: 'POST', token, body }),
};
