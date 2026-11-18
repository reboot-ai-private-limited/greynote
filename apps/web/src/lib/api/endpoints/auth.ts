import type {
  AuthTokensDto,
  LoginRequestDto,
  LoginResponseDto,
  UserSummaryDto,
} from '@greynote/contracts';
import { request } from '../client';

export const authApi = {
  login: (body: LoginRequestDto) =>
    request<LoginResponseDto>('/identity/auth/login', { method: 'POST', body }),

  /** Anyone who forgot their password: a code is emailed to the address in their details (an Admin with none: the owner). An account with no email gets an Admin to contact. */
  forgotPassword: (body: { employeeCode: string }) =>
    request<{ delivery: 'EMAIL' } | { delivery: 'NO_EMAIL'; admin: { name: string; email: string } | null }>('/identity/auth/forgot-password', { method: 'POST', body }),

  resetPassword: (body: { employeeCode: string; otp: string; newPassword: string }) =>
    request<Record<string, never>>('/identity/auth/reset-password', { method: 'POST', body }),

  /** My own password. The refresh cookie rides along so the server can keep this session and end the others. */
  changePassword: (token: string, body: { currentPassword: string; newPassword: string }) =>
    request<Record<string, never>>('/identity/auth/change-password', { method: 'POST', body, token }),

  /** The refresh token is the httpOnly cookie; there is nothing to send. */
  refresh: () => request<AuthTokensDto>('/identity/auth/refresh', { method: 'POST', body: {} }),

  logout: (token: string) =>
    request<Record<string, never>>('/identity/auth/logout', { method: 'POST', body: {}, token }),

  me: (token: string) => request<UserSummaryDto>('/identity/auth/me', { token }),
};
