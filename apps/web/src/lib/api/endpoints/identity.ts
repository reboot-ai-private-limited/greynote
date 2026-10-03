import type {
  CreateDesignationDto,
  CreateUserDto,
  CreatePayBandDto,
  DesignationDto,
  PaginatedDto,
  PayBandDto,
  PendingDeviceDto,
  UpdateDesignationDto,
  UpdatePayBandDto,
  UpdateUserDto,
  UserDetailDto,
  UserDocumentDto,
  UserListItemDto,
  UserListStatus,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListUsersQuery {
  page?: number | undefined;
  pageSize?: number | undefined;
  status?: UserListStatus | undefined;
  role?: UserListItemDto['role'] | undefined;
  designationId?: string | undefined;
  search?: string | undefined;
}

export const identityApi = {
  /** Not paginated: a bare array, oldest request first. */
  pendingDevices: (token: string, signal?: AbortSignal) =>
    request<PendingDeviceDto[]>('/identity/devices/pending', { token, signal }),

  users: (token: string, query: ListUsersQuery, signal?: AbortSignal) =>
    request<PaginatedDto<UserListItemDto>>('/identity/users', { token, query: { ...query }, signal }),

  user: (token: string, id: string, signal?: AbortSignal) =>
    request<UserDetailDto>(`/identity/users/${id}`, { token, signal }),

  updateUser: (token: string, id: string, body: UpdateUserDto) =>
    request<UserListItemDto>(`/identity/users/${id}`, { method: 'PATCH', token, body }),

  /** `multipart/form-data`: the document type, then the file. Returns the stored document. */
  uploadDocument: (token: string, userId: string, body: FormData) =>
    request<UserDocumentDto>(`/identity/users/${userId}/documents`, { method: 'POST', token, body }),

  removeDocument: (token: string, userId: string, documentId: string) =>
    request<Record<string, never>>(`/identity/users/${userId}/documents/${documentId}`, { method: 'DELETE', token }),

  createUser: (token: string, body: CreateUserDto) =>
    request<UserListItemDto>('/identity/users', { method: 'POST', token, body }),
};

/** Master data. Both lists are bare arrays: a handful of rows each, never paginated. */
export const designationsApi = {
  list: (token: string, signal?: AbortSignal) =>
    request<DesignationDto[]>('/identity/designations', { token, signal }),
  create: (token: string, body: CreateDesignationDto) =>
    request<DesignationDto>('/identity/designations', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateDesignationDto) =>
    request<DesignationDto>(`/identity/designations/${id}`, { method: 'PATCH', token, body }),
};

export const payBandsApi = {
  list: (token: string, signal?: AbortSignal) => request<PayBandDto[]>('/identity/pay-bands', { token, signal }),
  create: (token: string, body: CreatePayBandDto) =>
    request<PayBandDto>('/identity/pay-bands', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdatePayBandDto) =>
    request<PayBandDto>(`/identity/pay-bands/${id}`, { method: 'PATCH', token, body }),
};
