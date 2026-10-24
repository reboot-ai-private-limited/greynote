'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { useApprovalCsv } from '../hooks/useApprovalCsv';

/** "Download CSV" for the record a request is about. Shows nothing for a kind with no table. */
export function DownloadCsvButton({ request }: { request: Pick<ApprovalDetailDto, 'kind' | 'recordId' | 'status' | 'submitter'> }) {
  const csv = useApprovalCsv(request);
  if (!csv.available) return null;
  return (
    <Button variant="secondary" size="sm" disabled={csv.isPending || Boolean(csv.disabledReason)} title={csv.disabledReason} onClick={csv.download}>
      {csv.isPending ? 'Preparing…' : 'Download CSV'}
    </Button>
  );
}
