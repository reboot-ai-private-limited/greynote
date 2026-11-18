import { useColleagues } from '@/offline/colleagues';
import { prettyMonth } from '@/offline/day';
import { exportFileName, tourPlanCsv } from '@/lib/exports';
import { getTeamMemberTourPlan, offDayLabel } from '@/lib/planning';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { downloadMonthlyWorkReport } from '@/lib/work-reports';
import { useFinancialYear } from '@/lib/financial-year';

import { DownloadMenu, type DownloadItem } from '../../download-menu';
import { useTourPlan } from './tour-plan-data';

type Person = { id: string; name: string; employeeCode: string; designation: string | null };

/**
 * The person page's one **Download** (month shown above it): the Tour Plan, the Daily plans and the expense statement, each a CSV in the layout the person
 * gets on their own screens. Built live when tapped. A file with nothing in it says why instead of failing (no Tour Plan for the month).
 */
export function PersonDownloads({ person, month }: { person: Person; month: string }) {
  const { colleagues } = useColleagues();
  const fy = useFinancialYear();
  const fyLabel = fy.label.replace(/^FY /, '');
  const tour = useTourPlan(person.id, month);
  const who = { name: person.name, designation: person.designation, employeeCode: person.employeeCode };
  const title = (what: string) => `${person.name} · ${what} · ${prettyMonth(month)}`;

  const items: DownloadItem[] = [
    {
      key: 'tour',
      label: 'Tour Plan',
      hint: 'Every day: work type, routes, work with',
      disabledReason: tour.data === null ? `No Tour Plan for ${prettyMonth(month)}.` : null,
      build: async () => {
        const plan = await getTeamMemberTourPlan(person.id, month);
        if (!plan) return { empty: `${person.name} has no Tour Plan for ${prettyMonth(month)}.` };
        const offByDate = new Map((plan.offDays ?? []).map((d) => [d.date, d]));
        const byId = new Map(colleagues.map((c) => [c.id, c.name]));
        const csv = tourPlanCsv(month, plan.entries, {
          offLabel: (d) => {
            const off = offByDate.get(d);
            return off ? offDayLabel(off) : null;
          },
          routes: plan.routes,
          personName: (id) => byId.get(id) ?? null,
        });
        return { fileName: exportFileName('tour-plan', who, month), csv, title: title('Tour Plan') };
      },
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
