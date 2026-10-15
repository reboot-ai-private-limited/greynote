'use client';

import type { CreateUserDto, ReassignManagerDto, ReassignManagerResultDto, PhotoDto, UpdateUserDto, UserDocumentDto, UserListItemDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { identityApi, type ListUsersQuery } from '@/lib/api/endpoints/identity';
import { timing } from '@/lib/hooks/timing';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { photoForm } from '../lib/photo';

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

export function useUser(id: string | null | undefined) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.users.detail(id ?? ''),
      fetch: (token, signal) => identityApi.user(token, id ?? '', signal),
      staleTime: staleTime.live,
      enabled: Boolean(id),
    }),
  );
}

/** An employee's managers above and everyone below, for the Team tab. */
export function useReportingLine(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.users.reporting(id),
      fetch: (token, signal) => identityApi.reportingLine(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** One onboarding section's PATCH. Refetches the detail and the list (the status badge may have flipped). */
export function useUpdateUser(id: string, onDone: () => void) {
  return useApiMutation<UpdateUserDto, UserListItemDto>({
    call: (token, body) => identityApi.updateUser(token, id, body),
    invalidates: [keys.users.all()],
    successMessage: 'Saved.',
    onSuccess: onDone,
  });
}

/** Every active field employee by name only: the Accountant's pickers, which may not read employee records. */
export function useFieldDirectory(enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.fieldDirectory(),
      fetch: (token, signal) => identityApi.fieldDirectory(token, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** Active FIELD employees matching a search, for the manager picker. */
export function useManagerCandidates(term: string, enabled: boolean) {
  const debounced = useDebouncedValue(term.trim(), timing.searchDebounceMs);
  const query = { role: 'FIELD' as const, status: 'active' as const, page: 1, pageSize: 20, ...(debounced && { search: debounced }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.fieldEmployees.search(`manager:${debounced}`),
      fetch: (token, signal) => identityApi.users(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useUploadDocument(userId: string, onDone: () => void) {
  return useApiMutation<FormData, UserDocumentDto>({
    call: (token, form) => identityApi.uploadDocument(token, userId, form),
    invalidates: [keys.users.all()],
    successMessage: 'Document uploaded.',
    onSuccess: onDone,
  });
}

export function useRemoveDocument(userId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, documentId) => identityApi.removeDocument(token, userId, documentId),
    invalidates: [keys.users.all()],
    successMessage: 'Document removed.',
    onSuccess: onDone,
  });
}

export function useResetPassword(userId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, newPassword) => identityApi.resetPassword(token, userId, newPassword),
    successMessage: 'Password reset. The employee is signed out everywhere.',
    onSuccess: onDone,
  });
}

export function useUnblockUser(userId: string, onDone: () => void) {
  return useApiMutation({
    call: (token, reason: string) => identityApi.unblockUser(token, userId, reason),
    invalidates: [keys.users.all()],
    successMessage: 'Employee unblocked.',
    onSuccess: onDone,
  });
}

export function useDeactivateUser(userId: string, onDone: () => void) {
  return useApiMutation({
    call: (token) => identityApi.updateUser(token, userId, { status: 'inactive' }),
    // The status badge, the list and the employee's phones (their sessions ended) all change.
    invalidates: [keys.users.all(), keys.devices.all()],
    successMessage: 'Account deactivated.',
    onSuccess: onDone,
  });
}

/**
 * How many employees are in each status, and how many are blocked, for the current search, role and designation (not the status filter, which the
 * chips are). Each is a one-row list read for its total.
 */
export function useStatusCounts(base: { search?: string; role?: ListUsersQuery['role']; designationId?: string }) {
  const one = { page: 1, pageSize: 1, ...base };
  const active = useUsers({ ...one, status: 'active' });
  const pending = useUsers({ ...one, status: 'pending' });
  const inactive = useUsers({ ...one, status: 'inactive' });
  const blocked = useUsers({ ...one, isBlocked: true });
  const total = (q: typeof active) => q.data?.total ?? 0;
  return {
    counts: { active: total(active), pending: total(pending), inactive: total(inactive), blocked: total(blocked) },
    ready: !active.isLoading && !pending.isLoading && !inactive.isLoading && !blocked.isLoading,
  };
}

/** Sets or replaces an employee's photo; the server deletes the old file from Cloudinary. */
export function useSetPhoto(userId: string) {
  return useApiMutation<File, PhotoDto>({
    call: (token, file) => identityApi.setPhoto(token, userId, photoForm(file)),
    invalidates: [keys.users.all()],
    successMessage: 'Photo saved.',
  });
}

export function useRemovePhoto(userId: string) {
  return useApiMutation<void, PhotoDto>({
    call: (token) => identityApi.removePhoto(token, userId),
    invalidates: [keys.users.all()],
    successMessage: 'Photo removed.',
  });
}

/** Move several employees under one manager. The caller shows a refusal's per-person problems, so no error toast here. */
export function useReassignManager(onDone: (result: ReassignManagerResultDto) => void) {
  return useApiMutation<ReassignManagerDto, ReassignManagerResultDto>({
    call: (token, body) => identityApi.reassignManager(token, body),
    invalidates: [keys.users.all(), keys.org.all()],
    onSuccess: onDone,
  });
}
