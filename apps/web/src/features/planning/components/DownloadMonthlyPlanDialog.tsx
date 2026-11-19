'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { withAuth } from '@/lib/auth/session';
import { downloadTourPlanExcel } from '../lib/tourPlanExcel';

/** Plans are made a month ahead, so the month asked for first is next month (`YYYY-MM`). */
const nextMonth = () => {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 7);
};

/** Admin: pick a month, download that month of one employee's approved Tour Plan as an Excel file (the same file the phone gives). Mounted only while open. */
export function DownloadMonthlyPlanDialog({ user, onClose }: { user: Pick<UserDetailDto, 'id' | 'employeeCode'>; onClose: () => void }) {
  const [month, setMonth] = useState(nextMonth());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError('Choose a month.');
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await withAuth((token) => downloadTourPlanExcel(token, user.id, month));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog
      title="Download monthly plan"
      description="One row for every day of the approved plan: what is planned, and the weekly offs and holidays. The same file as on the phone."
      formId="download-monthly-plan-form"
      pending={pending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Month" htmlFor="download-plan-month" error={error} hint="Only an approved plan can be downloaded, as an Excel file.">
        <Input id="download-plan-month" type="month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={error ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
