import { useFinancialYear } from '@/lib/financial-year';
import { useSessionUser } from '@/lib/session';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { downloadMonthlyWorkReport } from '@/lib/work-reports';
import { prettyMonth } from '@/offline/day';

import { DownloadMenu } from './download-menu';

/** Your own reports as Excel: the Monthly work report for the month shown, and the Secondary sales sheet for the financial year. Saved on the phone (see `deliverFile`). */
export function OwnDownloads({ month }: { month: string }) {
  const me = useSessionUser();
  const fy = useFinancialYear();
  if (!me) return null;
  const person = { id: me.id, name: me.name };
  const fyLabel = fy.label.replace(/^FY /, '');
  return (
    <DownloadMenu
      items={[
        {
          key: 'monthly-work',
          label: `Monthly work report (Excel) · ${prettyMonth(month)}`,
          hint: 'Every day: plan, DCR, doctors, calls, orders, TA / DA / other, leave',
          build: async () => ({ delivered: await downloadMonthlyWorkReport(person, month, prettyMonth(month)) }),
        },
        {
          key: 'secondary',
          label: `Secondary sales (Excel) · ${fyLabel}`,
          hint: 'Your targets and approved secondary by product and month',
          build: async () => ({ delivered: await downloadSecondarySheet(person, fy.year, fyLabel) }),
        },
      ]}
    />
  );
}
