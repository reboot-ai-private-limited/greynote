import type { BulkGrantLateDto, BulkGrantLateResultDto, EligibleEmployeesDto, GrantLateDto, LateGrantDto, LateGrantKindDto, LateGrantKindInfoDto, LateGrantPreviewDto, LateGrantStatusDto, PaginatedDto } from '@greynote/contracts';
import { request } from '../client';

export interface ListLateGrantsQuery {
  page: number;
  pageSize: number;
  userId?: string | undefined;
  kind?: LateGrantKindDto | undefined;
  /** `YYYY-MM`. */
  month?: string | undefined;
  status?: LateGrantStatusDto | undefined;
}

export const lateGrantsApi = {
  kinds: (token: string, signal?: AbortSignal) => request<LateGrantKindInfoDto[]>('/late-grants/kinds', { token, signal }),
  list: (token: string, query: ListLateGrantsQuery, signal?: AbortSignal) =>
    request<PaginatedDto<LateGrantDto>>('/late-grants', { token, query: { ...query }, signal }),
  preview: (token: string, query: { userId: string; kind: LateGrantKindDto; periodKey: string }, signal?: AbortSignal) =>
    request<LateGrantPreviewDto>('/late-grants/preview', { token, query, signal }),
  grant: (token: string, body: GrantLateDto) => request<LateGrantDto>('/late-grants', { method: 'POST', token, body }),
  bulk: (token: string, body: BulkGrantLateDto) => request<BulkGrantLateResultDto>('/late-grants/bulk', { method: 'POST', token, body }),
  eligible: (token: string, query: { scope: 'all' | 'team'; managerId?: string }) => request<EligibleEmployeesDto>('/late-grants/eligible', { token, query }),
  revoke: (token: string, id: string) => request<LateGrantDto>(`/late-grants/${id}/revoke`, { method: 'POST', token }),
};
