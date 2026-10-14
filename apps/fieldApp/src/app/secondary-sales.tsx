import { useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { ScreenShell } from '@/components/screen-shell';
import { SecondarySalesPanel } from '@/components/secondary-sales-panel';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, StatusBanner, sym } from '@/components/ui-cards';
import { useFinancialYear } from '@/lib/financial-year';
import { addMonths, monthOf, prettyMonth } from '@/offline/day';

/**
 * Secondary Sales: the units of each product you sold on in a month. Since 2026-10-14 this is your own record: your achievement
 * against the targets is counted from your distributors' stock. The server takes entries for a month until its stock deadline, so a month two or more
 * back is shown closed here and the previous one is left to the server. Needs a connection.
 */
export default function SecondarySalesScreen() {
  const fy = useFinancialYear();

  // A month that has not started cannot take entries, so the stepper stops at this month (or the end of a past year).
  const thisMonth = monthOf(fy.today);
  const lastMonth = fy.isPast ? fy.lastMonth : thisMonth;
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);
  const closed = !fy.isPast && month < addMonths(thisMonth, -1);

  return (
    <ScreenShell title="Secondary Sales" subtitle="What you sold each month, sent to your manager for approval">
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      {closed ? (
        <StatusBanner accent="amber" icon={sym('lock', 'lock')} title="Month closed" text={`${prettyMonth(month)} is closed for secondary sales. Only an Admin can reopen it.`} />
      ) : null}
      <SecondarySalesPanel month={month} locked={closed} />
    </ScreenShell>
  );
}
