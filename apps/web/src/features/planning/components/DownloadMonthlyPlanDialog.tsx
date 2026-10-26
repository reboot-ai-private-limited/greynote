'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { planningApi } from '@/lib/api/endpoints/planning';
import { exportFilename, resolveExportOwner } from '@/lib/exportFilename';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { resolveWorkWithLabels } from '../lib/workWithLabels';
import { isDownloadable, monthlyPlanCsv, notApprovedMessage } from '../lib/monthlyPlanCsv';

/** Plans are made a month ahead, so the month asked for first is next month (`YYYY-MM`). */
const nextMonth = () => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 7);
};

/** Admin: pick a month, download that month of one employee's Tour Plan as a CSV. Mounted only while open. */
export function DownloadMonthlyPlanDialog({ user, onClose }: { user: Pick<UserDetailDto, 'id' | 'employeeCode'>; onClose: () => void }) {
  const directory = useTerritoryDirectory();
  const [month, setMonth] = useState(nextMonth());
  const [error, setError] = useState<string>();

  const download = useCsvExport(async (token, planMonth: string) => {
    const plan = await planningApi.userMonthly(token, user.id, planMonth);
    if (!isDownloadable(plan.status)) throw new Error(notApprovedMessage(planMonth));
    const label = await resolveWorkWithLabels(token, plan.entries.flatMap((e) => e.workWith));
    return {
      filename: exportFilename(await resolveExportOwner(token, user.id), 'monthly-plan', planMonth),
      csv: monthlyPlanCsv(plan, { routeLabel: directory.routeLabel, personName: (id) => label.get(id) ?? '—' }),
    };
  });

  function submit() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError('Choose a month.');
      return;
    }
    setError(undefined);
    download.mutate(month, { onSuccess: onClose });
  }

  return (
    <FormDialog
      title="Download monthly plan"
      description="One row for every day of the approved plan: what is planned, and the weekly offs and holidays."
      formId="download-monthly-plan-form"
      pending={download.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Month" htmlFor="download-plan-month" error={error} hint="Only an approved plan can be downloaded, as a CSV file.">
        <Input id="download-plan-month" type="month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={error ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
