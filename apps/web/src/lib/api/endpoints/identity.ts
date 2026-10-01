import type { PaginatedDto, PendingDeviceDto, UserListItemDto, UserListStatus } from '@greynote/contracts';
import { request } from '../client';

export interface ListUsersQuery {
  page?: number | undefined;
  pageSize?: number | undefined;
  status?: UserListStatus | undefined;
  role?: UserListItemDto['role'] | undefined;
  search?: string | undefined;
}

export const identityApi = {
  /** Not paginated: a bare array, oldest request first. */
  pendingDevices: (token: string, signal?: AbortSignal) =>
    request<PendingDeviceDto[]>('/identity/devices/pending', { token, signal }),

  users: (token: string, query: ListUsersQuery, signal?: AbortSignal) =>
    request<PaginatedDto<UserListItemDto>>('/identity/users', { token, query: { ...query }, signal }),
};
