'use client';

import { toast } from '@/components/ui/toast';
import { useApiMutation } from '@/lib/query/mutation';
import { downloadCsv } from '@/lib/csv';

/**
 * A "Download CSV" button's work: read everything with the signed-in token, build the file, hand it to the browser.
 * `build` returns the filename and CSV, plus `complete: false` when the read stopped early (the file says so in a toast).
 * A failed read toasts the server's wording, like any write.
 */
export function useCsvExport<TVars = void>(build: (token: string, vars: TVars) => Promise<{ filename: string; csv: string; complete?: boolean }>) {
  return useApiMutation<TVars, void>({
    call: async (token, vars) => {
      const { filename, csv, complete = true } = await build(token, vars);
      downloadCsv(filename, csv);
      if (!complete) toast.error('Too many rows for one file: the download holds only the first ones. Narrow the filters and download again.');
    },
  });
}
