'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useMonthlyWorkFile } from '../hooks/useSalesReport';
import { financialYearMonths } from '../lib/salesDashboard';
import { EmployeeSheetFrame, useEmployeeOptions } from './EmployeeSheetFrame';

/**
 * The Monthly Work report, as the phone has it: pick an employee and a month and see that employee's sheet (every day of the month with its kind, plans,
 * daily report, doctors, calls, orders and expenses), and download the same Excel. The months are those of the selected financial year up to this month.
 */
export function MonthlyWorkReportScreen() {
  const { year } = useFinancialYear();
  const today = istDate();
  const thisMonth = today.slice(0, 7);
  const months = useMemo(() => financialYearMonths(year ?? financialYearOf(today)).filter((m) => m <= thisMonth), [year, today, thisMonth]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && months.includes(picked) ? picked : (months[months.length - 1] ?? thisMonth);
  const [userId, setUserId] = useState('');
  const { options, name } = useEmployeeOptions(userId);
  const file = useMonthlyWorkFile(userId, month);

  return (
    <>
      <PageHeader title="Monthly work" description="One employee's month: every day with its kind, plans, daily report, doctors, calls, orders and expenses." />
      <EmployeeSheetFrame
        userId={userId}
        onUserChange={setUserId}
        options={options}
        file={file}
        filename={`GREYNOTE MONTHLY WORK ${month} ${name}.xlsx`}
        emptyTitle="Choose an employee to see their monthly work"
        emptyDescription="Pick an employee above. The month starts at the latest one; change it to look back."
        filters={
          <div className="grid w-44 gap-1 text-sm">
            <span className="font-medium text-text">Month</span>
            <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={setPicked} />
          </div>
        }
      />
    </>
  );
}
