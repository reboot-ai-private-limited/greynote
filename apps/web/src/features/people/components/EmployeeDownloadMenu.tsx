'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { employeeDcrsCsv } from '@/features/field-activity/lib/employeeDcrsCsv';
import { doctorsCsv } from '@/features/field-master-data/lib/doctorsCsv';
import { DownloadMonthlyPlanDialog } from '@/features/planning/components/DownloadMonthlyPlanDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { doctorsApi } from '@/lib/api/endpoints/fieldMasterData';
import { exportFilename, resolveExportOwner } from '@/lib/exportFilename';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { financialYearLabel, financialYearOf, financialYearRange, getFinancialYear } from '@/lib/financial-year';

/** Admin: one employee's assigned doctors, and their daily reports for the selected financial year, and a month of their Tour Plan, as CSV. */
export function EmployeeDownloadMenu({ user }: { user: Pick<UserDetailDto, 'id' | 'employeeCode'> }) {
  const directory = useTerritoryDirectory();
  const [planOpen, setPlanOpen] = useState(false);
  const doctors = useCsvExport(async (token) => {
    const { items, complete } = await fetchAllPages((page) => doctorsApi.assignedTo(token, user.id, { page, pageSize: MAX_PAGE_SIZE }), 100);
    return { filename: exportFilename(await resolveExportOwner(token, user.id), 'doctors'), csv: doctorsCsv(items, directory.routeLabel), complete };
  });
  const dcrs = useCsvExport(async (token) => {
    const year = getFinancialYear() ?? financialYearOf(new Date().toISOString().slice(0, 10));
    const rows = await fieldActivityApi.dcrs(token, { userId: user.id, ...financialYearRange(year) });
    return { filename: exportFilename(await resolveExportOwner(token, user.id), 'dcr', financialYearLabel(year).replace('–', '-')), csv: employeeDcrsCsv(rows) };
  });

  return (
    <>
      <DropdownMenu
        trigger={
          <Button variant="secondary" disabled={doctors.isPending || dcrs.isPending}>
            {doctors.isPending || dcrs.isPending ? 'Preparing…' : 'Download'}
          </Button>
        }
        items={[
          { label: 'Assigned doctors (CSV)', onSelect: () => doctors.mutate() },
          { label: 'Daily reports (CSV)', onSelect: () => dcrs.mutate() },
          { label: 'Monthly plan (CSV)', onSelect: () => setPlanOpen(true) },
        ]}
      />
      {planOpen ? <DownloadMonthlyPlanDialog user={user} onClose={() => setPlanOpen(false)} /> : null}
    </>
  );
}
