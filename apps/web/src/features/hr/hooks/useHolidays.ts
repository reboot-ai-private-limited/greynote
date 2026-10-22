'use client';

import type { CreateHolidayDto, HolidayImportResultDto } from '@greynote/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { withAuth } from '@/lib/auth/session';
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
  return useApiMutation<{ id: string; group: boolean }>({
    call: (token, { id, group }) => hrApi.deleteHoliday(token, id, group),
    invalidates: [keys.hr.allHolidays()],
    successMessage: 'Holiday removed.',
    onSuccess: onDone,
  });
}

/** Checks a holiday CSV (`dryRun`) or imports it. Its 400 is shown inline by the dialog, line by line, so there is no toast. */
export function useImportHolidays(onImported: (result: HolidayImportResultDto) => void) {
  const queryClient = useQueryClient();
  return useMutation<HolidayImportResultDto, Error, { file: File; dryRun: boolean }>({
    mutationFn: ({ file, dryRun }) => withAuth((token) => hrApi.importHolidays(token, file, dryRun)),
    onSuccess: (result, { dryRun }) => {
      if (dryRun) return;
      void queryClient.invalidateQueries({ queryKey: keys.hr.allHolidays() });
      onImported(result);
    },
  });
}
