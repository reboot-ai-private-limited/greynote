'use client';

import type { CreateDistributorDto, DistributorDocumentDto, DistributorDto, UpdateDistributorDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { distributorsApi, type ListDistributorsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { toast } from '@/components/ui/toast';
import { buildDocumentForm } from '@/features/people/lib/documents';
import { useApiMutation } from '@/lib/query/mutation';

export function useDistributors(query?: ListDistributorsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributors.list(query),
      fetch: (token, signal) => distributorsApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useDistributor(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributors.detail(id),
      fetch: (token, signal) => distributorsApi.get(token, id, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export interface NewDistributor {
  body: CreateDistributorDto;
  /** Attached one by one once the distributor exists. */
  documents: ReadonlyArray<{ type: string; file: File }>;
}

/**
 * Creates the distributor, then attaches its chosen files. A file that fails does not undo the distributor (a retry would add a second
 * one): it is named in a toast and can be uploaded again from the distributor's page.
 */
export function useCreateDistributor(onDone: (distributor: DistributorDto) => void) {
  return useApiMutation<NewDistributor, DistributorDto>({
    call: async (token, { body, documents }) => {
      const created = await distributorsApi.create(token, body);
      const failed: string[] = [];
      for (const d of documents) {
        try {
          await distributorsApi.uploadDocument(token, created.id, buildDocumentForm(d.type, d.file));
        } catch {
          failed.push(d.file.name);
        }
      }
      if (failed.length > 0) toast.error(`The distributor was created, but these files did not upload: ${failed.join(', ')}. Add them from its page.`);
      return created;
    },
    invalidates: [keys.distributors.all()],
    successMessage: 'Distributor created.',
    onSuccess: onDone,
  });
}

export function useUpdateDistributor(onDone?: (distributor: DistributorDto) => void) {
  return useApiMutation<{ id: string; body: UpdateDistributorDto }, DistributorDto>({
    call: (token, { id, body }) => distributorsApi.update(token, id, body),
    invalidates: [keys.distributors.all()],
    successMessage: 'Distributor updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useUploadDistributorDocument(id: string, onDone: () => void) {
  return useApiMutation<FormData, DistributorDocumentDto>({
    call: (token, form) => distributorsApi.uploadDocument(token, id, form),
    invalidates: [keys.distributors.all()],
    successMessage: 'Document uploaded.',
    onSuccess: onDone,
  });
}

export function useRemoveDistributorDocument(id: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, documentId) => distributorsApi.removeDocument(token, id, documentId),
    invalidates: [keys.distributors.all()],
    successMessage: 'Document removed.',
    onSuccess: onDone,
  });
}
