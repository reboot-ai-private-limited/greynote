import { prettyMonth } from '@/offline/day';
import { downloadTourPlan, downloadMonthlyWorkReport } from '@/lib/work-reports';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { useFinancialYear } from '@/lib/financial-year';

import { DownloadMenu, type DownloadItem } from '../../download-menu';
import { useTourPlan } from './tour-plan-data';

type Person = { id: string; name: string; employeeCode: string; designation: string | null };

/**
 * The person page's one **Download** (month shown above it): the Tour Plan, the Daily plans and the expense statement, the Tour Plan as Excel (the server builds it, the same file as on the web) and the others as CSV. Built live when tapped. A file with nothing in it says why instead of failing (no approved Tour Plan for the month).
 */
export function PersonDownloads({ person, month }: { person: Person; month: string }) {
  const fy = useFinancialYear();
  const fyLabel = fy.label.replace(/^FY /, '');
  const tour = useTourPlan(person.id, month);

  const items: DownloadItem[] = [
    {
      key: 'tour',
      label: `Tour Plan (Excel) · ${prettyMonth(month)}`,
      hint: 'Every day: work type, routes, work with. Approved plan only',
      disabledReason: tour.data === null ? `No Tour Plan for ${prettyMonth(month)}.` : tour.data && tour.data.status !== 'APPROVED' && tour.data.status !== 'MANAGER_APPROVED' ? `${prettyMonth(month)}’s Tour Plan isn’t approved yet.` : null,
      build: async () => ({ delivered: await downloadTourPlan({ id: person.id, name: person.name }, month, prettyMonth(month)) }),
    },
    {
      key: 'monthly-work',
      label: `Monthly work report (Excel) · ${prettyMonth(month)}`,
      hint: 'Every day: plan, DCR, doctors, calls, orders, TA / DA / other, leave',
      build: async () => ({ delivered: await downloadMonthlyWorkReport({ id: person.id, name: person.name }, month, prettyMonth(month)) }),
    },
    {
      key: 'secondary',
      label: `Secondary sales (Excel) · ${fyLabel}`,
      hint: 'Targets and approved secondary by product and month, for the financial year',
      build: async () => ({ delivered: await downloadSecondarySheet({ id: person.id, name: person.name }, fy.year, fyLabel) }),
    },
  ];
  return <DownloadMenu items={items} />;
}
