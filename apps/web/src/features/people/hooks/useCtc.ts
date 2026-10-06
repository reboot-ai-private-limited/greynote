'use client';

import type {
  AssignCtcDto,
  AssignCtcResultDto,
  CreatePayComponentDto,
  PreviewCtcDto,
  ReapplyCtcDto,
  ReapplyOutcomeDto,
  UpdatePayComponentDto,
} from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';
import { ctcApi, payComponentsApi } from '@/lib/api/endpoints/identity';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function usePayComponents() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payComponents.all(),
      fetch: (token, signal) => payComponentsApi.list(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

// A formula change affects every preview, so those are refreshed with it.
const formulaKeys = [keys.payComponents.all(), keys.ctc.all()] as const;

export function useCreatePayComponent(onDone: () => void) {
  return useApiMutation<CreatePayComponentDto>({
    call: (token, body) => payComponentsApi.create(token, body),
    invalidates: formulaKeys,
    successMessage: 'Component added.',
    onSuccess: onDone,
  });
}
export function useUpdatePayComponent(onDone: () => void) {
  return useApiMutation<{ id: string; body: UpdatePayComponentDto }>({
    call: (token, { id, body }) => payComponentsApi.update(token, id, body),
    invalidates: formulaKeys,
    successMessage: 'Component updated. Saved CTCs keep their breakdown until you re-apply the formula.',
    onSuccess: onDone,
  });
}

export function useCtcHistory(userId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.ctc.history(userId),
      fetch: (token, signal) => ctcApi.history(token, userId, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** The live breakdown behind the CTC form. Waits for typing to pause, and does nothing until there is a usable CTC. */
export function useCtcPreview(body: PreviewCtcDto | null) {
  const settled = useDebouncedValue(body, 300);
  return useQuery(
    authedQueryOptions({
      queryKey: keys.ctc.preview(settled ?? {}),
      fetch: (token, signal) => ctcApi.preview(token, settled as PreviewCtcDto, signal),
      staleTime: staleTime.live,
      enabled: settled !== null,
      retry: false,
    }),
  );
}

export function useAssignCtc(userId: string, onDone: () => void) {
  return useApiMutation<AssignCtcDto, AssignCtcResultDto>({
    call: (token, body) => ctcApi.assign(token, userId, body),
    invalidates: [keys.ctc.history(userId)],
    onSuccess: (saved) => {
      // Saved either way; a big jump is only a warning.
      if (saved.warning) toast.error(`CTC saved. Note: ${saved.warning}`);
      else toast.success('CTC saved.');
      onDone();
    },
  });
}

export function useReapplyCtc(onDone: (outcomes: ReapplyOutcomeDto[]) => void) {
  return useApiMutation<ReapplyCtcDto, ReapplyOutcomeDto[]>({
    call: (token, body) => ctcApi.reapply(token, body),
    invalidates: [keys.ctc.all()],
    onSuccess: onDone,
  });
}
