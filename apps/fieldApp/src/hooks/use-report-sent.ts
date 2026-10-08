import { useRecords } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldActivitySnapshot } from '@/types/sync';

/**
 * Whether today's report is already with the manager. Once it is, the server takes no more calls,
 * followups or expenses on it until it is sent back, so those screens stop offering "add".
 * The server's status (last pull) wins; the phone's own record of a sent submit only counts before
 * the first pull.
 */
export function useReportSent(today: string): boolean {
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const { records } = useRecords(['DCR_SUBMIT']);
  const status = activity.data?.dcrs?.find((d) => d.reportDate === today)?.status;
  if (status !== undefined) return ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'].includes(status);
  return records.some(
    (r) => !r.deleted && r.status === 'SYNCED' && (r.payload as { reportDate?: string }).reportDate === today,
  );
}
