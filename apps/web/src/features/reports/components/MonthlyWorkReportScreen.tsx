'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useAllFieldEmployees } from '@/features/people/hooks/useUsers';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { withAuth } from '@/lib/auth/session';
import { istDate } from '@/lib/dates';
import { downloadBlob } from '@/lib/download';
import { financialYearOf } from '@/lib/financial-year';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { financialYearMonths } from '../lib/salesDashboard';

/**
 * The Monthly Work report, as the phone has it: pick an employee and a month, and get that employee's Excel (every day of the month with its kind,
 * plans, daily report, doctors, calls, orders and expenses). The months are those of the selected financial year up to this month.
 */
export function MonthlyWorkReportScreen() {
  const { year } = useFinancialYear();
  const today = istDate();
  const thisMonth = today.slice(0, 7);
  const months = useMemo(() => financialYearMonths(year ?? financialYearOf(today)).filter((m) => m <= thisMonth), [year, today, thisMonth]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : (months[months.length - 1] ?? thisMonth);
  const [userId, setUserId] = useState('');
  const employees = useAllFieldEmployees(true);
  const options = (employees.data ?? []).map((u) => ({ value: u.id, label: u.employeeCode ? `${u.name} (${u.employeeCode})` : u.name }));
  const name = (employees.data ?? []).find((u) => u.id === userId)?.name ?? '';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await withAuth((token) => reportsApi.employeeMonthlyWork(token, { userId, month }));
      downloadBlob(`GREYNOTE MONTHLY WORK ${month} ${name}.xlsx`.replace(/\s+\.xlsx$/, '.xlsx'), file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Monthly work" description="One employee's month as an Excel file: every day with its kind, plans, daily report, doctors, calls, orders and expenses." />
      <Card>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="grid gap-1 text-sm">
            <span className="font-medium text-text">Employee</span>
            <SearchableSelect aria-label="Employee" value={userId} onValueChange={setUserId} options={options} placeholder="Search and choose an employee…" searchPlaceholder="Name or code…" />
          </div>
          <div className="grid gap-1 text-sm">
            <span className="font-medium text-text">Month</span>
            <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={setPicked} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={!userId || busy} onClick={() => void download()}>
            {busy ? 'Making the file…' : 'Download Excel'}
          </Button>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        </div>
      </Card>
    </>
  );
}
