import type {
  AssignCtcDto,
  AssignCtcResultDto,
  CreateDesignationDto,
  CreatePayComponentDto,
  CtcAssignmentDto,
  CtcPreviewDto,
  PayComponentDto,
  PreviewCtcDto,
  ReapplyCtcDto,
  ReapplyOutcomeDto,
  UpdatePayComponentDto,
  CreateUserDto,
  EmployeeDraftDto,
  FinalizedEmployeeDto,
  SaveEmployeeDraftDto,
  CreatePayBandDto,
  DesignationDto,
  PaginatedDto,
  PayBandDto,
  ApplyDuePromotionsResultDto,
  PromotionDto,
  PromotionPreviewDto,
  PromotionRequestDto,
  PromotionStatus,
  PendingDeviceDto,
  UpdatePayBandDto,
  UpdateUserDto,
  UserDetailDto,
  UserDeviceDto,
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
  /** Only blocked employees. Send `true` or leave out: the API reads any present value as true. */
  isBlocked?: true | undefined;
}

export const identityApi = {
  /** Not paginated: a bare array, oldest request first. */
  pendingDevices: (token: string, signal?: AbortSignal) =>
    request<PendingDeviceDto[]>('/identity/devices/pending', { token, signal }),

  users: (token: string, query: ListUsersQuery, signal?: AbortSignal) =>
    request<PaginatedDto<UserListItemDto>>('/identity/users', { token, query: { ...query }, signal }),

  userDevices: (token: string, userId: string, signal?: AbortSignal) =>
    request<UserDeviceDto[]>(`/identity/users/${userId}/devices`, { token, signal }),

  /** `approve` and `reject` return the device; `remove` and `logout` return nothing. */
  decideDevice: (token: string, userId: string, deviceRowId: string, action: 'approve' | 'reject') =>
    request<UserDeviceDto>(`/identity/users/${userId}/devices/${deviceRowId}/${action}`, { method: 'POST', token }),
  removeDevice: (token: string, userId: string, deviceRowId: string) =>
    request<Record<string, never>>(`/identity/users/${userId}/devices/${deviceRowId}`, { method: 'DELETE', token }),
  logoutDevice: (token: string, userId: string, deviceRowId: string) =>
    request<Record<string, never>>(`/identity/users/${userId}/devices/${deviceRowId}/logout`, { method: 'POST', token }),

  /** Ends every session of the employee. Admin only. */
  resetPassword: (token: string, userId: string, newPassword: string) =>
    request<Record<string, never>>(`/identity/users/${userId}/reset-password`, { method: 'POST', token, body: { newPassword } }),

  /** Clears a compliance block. Admin, or a manager above the employee; the reason is kept as the audit trail. A no-op for someone who is not blocked. */
  unblockUser: (token: string, userId: string, reason: string) =>
    request<Record<string, never>>(`/identity/users/${userId}/unblock`, { method: 'POST', token, body: { reason } }),

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

/** Half-filled new-employee forms, and the last step that turns one into a login. */
export const employeeDraftsApi = {
  list: (token: string, signal?: AbortSignal) => request<EmployeeDraftDto[]>('/identity/employee-drafts', { token, signal }),
  get: (token: string, id: string, signal?: AbortSignal) => request<EmployeeDraftDto>(`/identity/employee-drafts/${id}`, { token, signal }),
  create: (token: string, body: SaveEmployeeDraftDto) =>
    request<EmployeeDraftDto>('/identity/employee-drafts', { method: 'POST', token, body }),
  update: (token: string, id: string, body: SaveEmployeeDraftDto) =>
    request<EmployeeDraftDto>(`/identity/employee-drafts/${id}`, { method: 'PATCH', token, body }),
  remove: (token: string, id: string) =>
    request<Record<string, never>>(`/identity/employee-drafts/${id}`, { method: 'DELETE', token }),
  /** Returns the generated password this once. */
  finalize: (token: string, id: string) =>
    request<FinalizedEmployeeDto>(`/identity/employee-drafts/${id}/finalize`, { method: 'POST', token }),
};

/** Master data. Both lists are bare arrays: a handful of rows each, never paginated. */
export const designationsApi = {
  list: (token: string, signal?: AbortSignal) =>
    request<DesignationDto[]>('/identity/designations', { token, signal }),
  create: (token: string, body: CreateDesignationDto) =>
    request<DesignationDto>('/identity/designations', { method: 'POST', token, body }),
};

export const payBandsApi = {
  list: (token: string, signal?: AbortSignal) => request<PayBandDto[]>('/identity/pay-bands', { token, signal }),
  create: (token: string, body: CreatePayBandDto) =>
    request<PayBandDto>('/identity/pay-bands', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdatePayBandDto) =>
    request<PayBandDto>(`/identity/pay-bands/${id}`, { method: 'PATCH', token, body }),
};

/** The org-wide CTC formula and each employee's CTC revisions. */
export const payComponentsApi = {
  list: (token: string, signal?: AbortSignal) => request<PayComponentDto[]>('/identity/pay-components', { token, signal }),
  create: (token: string, body: CreatePayComponentDto) =>
    request<PayComponentDto>('/identity/pay-components', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdatePayComponentDto) =>
    request<PayComponentDto>(`/identity/pay-components/${id}`, { method: 'PATCH', token, body }),
};

export const ctcApi = {
  preview: (token: string, body: PreviewCtcDto, signal?: AbortSignal) =>
    request<CtcPreviewDto>('/identity/ctc/preview', { method: 'POST', token, body, signal }),
  history: (token: string, userId: string, signal?: AbortSignal) =>
    request<CtcAssignmentDto[]>(`/identity/users/${userId}/ctc`, { token, signal }),
  assign: (token: string, userId: string, body: AssignCtcDto) =>
    request<AssignCtcResultDto>(`/identity/users/${userId}/ctc`, { method: 'POST', token, body }),
  reapply: (token: string, body: ReapplyCtcDto) =>
    request<ReapplyOutcomeDto[]>('/identity/ctc/reapply', { method: 'POST', token, body }),
};

export const promotionsApi = {
  preview: (token: string, userId: string, body: PromotionRequestDto, signal?: AbortSignal) =>
    request<PromotionPreviewDto>(`/identity/users/${userId}/promotions/preview`, { method: 'POST', token, body, signal }),
  schedule: (token: string, userId: string, body: PromotionRequestDto) =>
    request<PromotionDto>(`/identity/users/${userId}/promotions`, { method: 'POST', token, body }),
  forUser: (token: string, userId: string, signal?: AbortSignal) => request<PromotionDto[]>(`/identity/users/${userId}/promotions`, { token, signal }),
  all: (token: string, status?: PromotionStatus, signal?: AbortSignal) =>
    request<PromotionDto[]>(`/identity/promotions${status ? `?status=${status}` : ''}`, { token, signal }),
  cancel: (token: string, promotionId: string) => request<PromotionDto>(`/identity/promotions/${promotionId}/cancel`, { method: 'POST', token }),
  applyDue: (token: string) => request<ApplyDuePromotionsResultDto>('/identity/promotions/apply-due', { method: 'POST', token }),
};
