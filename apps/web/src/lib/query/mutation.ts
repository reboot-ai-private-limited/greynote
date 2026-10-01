'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import { ApiError } from '../api/ApiError';
import { withAuth } from '../auth/session';

/** How every authenticated write is built — the counterpart to `authedQueryOptions`. */
export interface ApiMutationInput<TVars, TResult> {
  call: (token: string, vars: TVars) => Promise<TResult>;
  /** Key factories to invalidate once this settles — `keys.zones.all()`, never a literal. */
  invalidates?: readonly QueryKey[];
  /** Toasted on success. Omit for a write whose result is visible on screen anyway. */
  successMessage?: string;
  onSuccess?: (result: TResult, vars: TVars) => void;
}

export function buildMutationFn<TVars, TResult>(
  call: ApiMutationInput<TVars, TResult>['call'],
): (vars: TVars) => Promise<TResult> {
  return (vars) => withAuth((token) => call(token, vars));
}

export function useApiMutation<TVars = void, TResult = unknown>({
  call,
  invalidates,
  successMessage,
  onSuccess,
}: ApiMutationInput<TVars, TResult>) {
  const queryClient = useQueryClient();

  return useMutation<TResult, Error, TVars>({
    mutationFn: buildMutationFn(call),
    onSuccess: (result, vars) => {
      if (successMessage !== undefined) toast.success(successMessage);
      onSuccess?.(result, vars);
    },
    // The server's wording, verbatim, with the request id beside it.
    onError: (error) => {
      if (error instanceof ApiError) toast.error(error.message, error.requestId);
      else toast.error(error.message);
    },
    // On settled, not success: a CONFLICT changed nothing here but means the cache is stale.
    onSettled: () => {
      for (const key of invalidates ?? []) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
