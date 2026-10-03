'use client';

import type { CreateHolidayDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { hrApi, type ListHolidaysQuery } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Holidays in a range of at most 400 days. `enabled` is off while the range is invalid, so no request is sent. */
export function useHolidays(query: ListHolidaysQuery, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.hr.holidays(query),
      fetch: (token, signal) => hrApi.holidays(token, query, signal),
      staleTime: staleTime.configuration,
      enabled,
    }),
  );
}

export function useCreateHoliday(onDone: () => void) {
  return useApiMutation<CreateHolidayDto>({
    call: (token, body) => hrApi.createHoliday(token, body),
    invalidates: [keys.hr.allHolidays()],
    successMessage: 'Holiday added.',
    onSuccess: onDone,
  });
}

export function useDeleteHoliday(onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => hrApi.deleteHoliday(token, id),
    invalidates: [keys.hr.allHolidays()],
    successMessage: 'Holiday removed.',
    onSuccess: onDone,
  });
}
