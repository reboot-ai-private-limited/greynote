'use client';

import { authApi } from '@/lib/api/endpoints/auth';
import { useApiMutation } from '@/lib/query/mutation';

export function useChangePassword(onDone: () => void) {
  return useApiMutation<{ currentPassword: string; newPassword: string }>({
    call: (token, body) => authApi.changePassword(token, body),
    successMessage: 'Password changed. Your other sessions were signed out.',
    onSuccess: onDone,
  });
}
