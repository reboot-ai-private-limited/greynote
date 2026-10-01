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

  /** The refresh token is the httpOnly cookie; there is nothing to send. */
  refresh: () => request<AuthTokensDto>('/identity/auth/refresh', { method: 'POST', body: {} }),

  logout: (token: string) =>
    request<Record<string, never>>('/identity/auth/logout', { method: 'POST', body: {}, token }),

  me: (token: string) => request<UserSummaryDto>('/identity/auth/me', { token }),
};
