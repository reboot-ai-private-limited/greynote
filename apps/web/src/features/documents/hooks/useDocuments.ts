'use client';

import { useQuery } from '@tanstack/react-query';
import { documentsApi } from '@/lib/api/endpoints/documents';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useDocuments() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.documents.all(),
      fetch: (token, signal) => documentsApi.list(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useUploadDocument(onDone: () => void) {
  return useApiMutation<FormData>({
    call: (token, body) => documentsApi.upload(token, body),
    invalidates: [keys.documents.all()],
    successMessage: 'Document added.',
    onSuccess: onDone,
  });
}

export function useRemoveDocument(onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => documentsApi.remove(token, id),
    invalidates: [keys.documents.all()],
    successMessage: 'Document removed.',
    onSuccess: onDone,
  });
}
