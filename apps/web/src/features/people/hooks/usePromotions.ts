'use client';

import type { ApplyDuePromotionsResultDto, PromotionDto, PromotionRequestDto, PromotionStatus } from '@greynote/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { promotionsApi } from '@/lib/api/endpoints/identity';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** What the form would do, worked out by the server: the team, where each goes, what stops it. Waits for typing to pause; nothing is saved. */
export function usePromotionPreview(userId: string, body: PromotionRequestDto | null) {
  const settled = useDebouncedValue(body, 300);
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.promotions.preview(userId, settled ?? {}),
      fetch: (token, signal) => promotionsApi.preview(token, userId, settled as PromotionRequestDto, signal),
      staleTime: staleTime.live,
      enabled: settled !== null,
      retry: false,
    }),
    // Keep showing the last preview while the next one is worked out, so the table does not flicker as the form is edited.
    placeholderData: keepPreviousData,
  });
}

export function usePromotionsOf(userId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.promotions.forUser(userId),
      fetch: (token, signal) => promotionsApi.forUser(token, userId, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useAllPromotions(status: PromotionStatus | '') {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.promotions.list(status),
      fetch: (token, signal) => promotionsApi.all(token, status || undefined, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useSchedulePromotion(userId: string, onDone: (saved: PromotionDto) => void) {
  return useApiMutation<PromotionRequestDto, PromotionDto>({
    call: (token, body) => promotionsApi.schedule(token, userId, body),
    invalidates: [keys.promotions.all()],
    successMessage: 'Promotion scheduled. Nothing changes until its month starts.',
    onSuccess: onDone,
  });
}

export function useCancelPromotion(onDone?: () => void) {
  return useApiMutation<string, PromotionDto>({
    call: (token, promotionId) => promotionsApi.cancel(token, promotionId),
    invalidates: [keys.promotions.all()],
    successMessage: 'Promotion cancelled.',
    ...(onDone ? { onSuccess: onDone } : {}),
  });
}

/** The server does this every hour; this is the manual button. It can change employees, so those are refreshed too. */
export function useApplyDuePromotions(onDone: (result: ApplyDuePromotionsResultDto) => void) {
  return useApiMutation<void, ApplyDuePromotionsResultDto>({
    call: (token) => promotionsApi.applyDue(token),
    invalidates: [keys.promotions.all(), keys.users.all(), keys.ctc.all()],
    onSuccess: onDone,
  });
}
