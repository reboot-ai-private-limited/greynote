import { prettyMonth } from '@/offline/day';
import { downloadTourPlan, downloadMonthlyWorkReport } from '@/lib/work-reports';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { useFinancialYear } from '@/lib/financial-year';

import { DownloadsCard } from '../../report-kit';
import { useTourPlan } from './tour-plan-data';

type Person = { id: string; name: string; employeeCode: string; designation: string | null };

/**
 * A team member's detailed Excel sheets (2026-11-28), the same ones Admin downloads, as the same "Downloads · Excel" card as your own Reports:
 * their Monthly work report and Tour Plan for the month shown, and their Secondary sales sheet for the year. The server builds each when tapped.
 */
export function PersonDownloads({ person, month }: { person: Person; month: string }) {
  const fy = useFinancialYear();
  const fyLabel = fy.label.replace(/^FY /, '');
  const tour = useTourPlan(person.id, month);
  const approved = tour.data?.status === 'APPROVED' || tour.data?.status === 'MANAGER_APPROVED';
  const who = { id: person.id, name: person.name };
  return (
    <DownloadsCard
      title={`Downloads · Excel · ${person.name.split(' ')[0]}`}
      files={[
        { key: 'work', title: 'Monthly work report', about: `${prettyMonth(month)} · every day’s plan, DCR, calls, expenses`, run: () => downloadMonthlyWorkReport(who, month, prettyMonth(month)) },
        { key: 'secondary', title: 'Secondary sales', about: `FY ${fyLabel} · by product and month`, run: () => downloadSecondarySheet(who, fy.year, fyLabel) },
        { key: 'tour', title: 'Tour Plan', about: prettyMonth(month), run: () => downloadTourPlan(who, month, prettyMonth(month)), unavailable: approved ? null : tour.data ? 'Once approved' : 'None yet' },
      ]}
    />
  );
}
