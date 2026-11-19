'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { planningApi } from '@/lib/api/endpoints/planning';
import { withAuth } from '@/lib/auth/session';
import { downloadTourPlanExcel, isDownloadable } from '@/features/planning/lib/tourPlanExcel';

/** "Download Excel" for a Tour Plan request: the same file the phone gives, only once the plan is approved. */
export function DownloadTourPlanButton({ request }: { request: Pick<ApprovalDetailDto, 'recordId' | 'status'> }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await withAuth(async (token) => {
        const plan = await planningApi.monthly(token, request.recordId);
        await downloadTourPlanExcel(token, plan.userId, plan.planMonth);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const approved = isDownloadable(request.status);
  return (
    <Button variant="secondary" size="sm" disabled={busy || !approved} title={approved ? undefined : 'Only an approved plan can be downloaded.'} onClick={download}>
      {busy ? 'Preparing…' : 'Download Excel'}
    </Button>
  );
}
