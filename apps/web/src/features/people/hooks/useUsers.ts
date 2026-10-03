'use client';

import type { CreateUserDto, UserListItemDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { identityApi, type ListUsersQuery } from '@/lib/api/endpoints/identity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useUsers(query: ListUsersQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.users.list(query),
      fetch: (token, signal) => identityApi.users(token, query, signal),
      // Other people (a device approval, an onboarding edit) change this list.
      staleTime: staleTime.live,
    }),
  );
}

export function useCreateUser(onDone: (user: UserListItemDto) => void) {
  return useApiMutation<CreateUserDto, UserListItemDto>({
    call: (token, body) => identityApi.createUser(token, body),
    invalidates: [keys.users.all()],
    successMessage: 'Employee created.',
    onSuccess: onDone,
  });
}
