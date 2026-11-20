'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useSecondarySheetFile } from '../hooks/useSalesReport';
import { EmployeeSheetFrame, useEmployeeOptions } from './EmployeeSheetFrame';

/**
 * One employee's Secondary Sales sheet for the financial year chosen in the top bar (the phone's sheet): target and secondary by product, month by month.
 * Changing the year in the top bar reloads it.
 */
export function SecondarySalesSheetScreen() {
  const { year } = useFinancialYear();
  const fy = year ?? financialYearOf(istDate());
  const [userId, setUserId] = useState('');
  const { options, name } = useEmployeeOptions(userId);
  const file = useSecondarySheetFile(userId, fy);
  const label = financialYearLabel(fy);

  return (
    <>
      <PageHeader title="Secondary sales" description="One employee's secondary sales for the financial year in the top bar: target and secondary by product, month by month." />
      <EmployeeSheetFrame
        userId={userId}
        onUserChange={setUserId}
        options={options}
        file={file}
        filename={`GREYNOTE SECONDARY SALES ${label} ${name}.xlsx`}
        emptyTitle={`Choose an employee to see their secondary sales for ${label}`}
        emptyDescription="Pick an employee above. To look at another year, change the financial year in the top bar."
        filters={
          <div className="grid gap-1 text-sm">
            <span className="font-medium text-text">Financial year</span>
            <span className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-text">{label}</span>
          </div>
        }
      />
    </>
  );
}
