import { useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { PillToggle } from '@/components/pill-toggle';
import { ScreenShell } from '@/components/screen-shell';
import { DistributorStockPanel, SecondarySalesPanel } from '@/components/secondary-sales-panel';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, StatusBanner, sym } from '@/components/ui-cards';
import { useFinancialYear } from '@/lib/financial-year';
import { useRecords } from '@/offline';
import { addMonths, monthOf, prettyMonth } from '@/offline/day';

type Tab = 'stock' | 'record';

/**
 * Secondary Sales: count your distributors' opening and closing stock by product (which drives your monthly achievement at PTS,
 * works offline via `MONTHLY_STOCK`), or keep your own per-product secondary record for manager approval. The server takes
 * entries for a month until its stock deadline, so a month two or more back is shown closed here and the previous one is left
 * to the server.
 */
export default function SecondarySalesScreen() {
  const fy = useFinancialYear();
  const { records } = useRecords(['MONTHLY_STOCK']);
  const waitingCount = records.filter((r) => !r.deleted && r.status !== 'SYNCED').length;

  // A month that has not started cannot take entries, so the stepper stops at this month (or the end of a past year).
  const thisMonth = monthOf(fy.today);
  const lastMonth = fy.isPast ? fy.lastMonth : thisMonth;
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stock');
  const month = clamp(picked ?? lastMonth);
  const closed = !fy.isPast && month < addMonths(thisMonth, -1);

  return (
    <ScreenShell title="Secondary Sales" subtitle="Count distributor stock by product, or keep your own monthly record">
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      <PillToggle
        options={[
          { value: 'stock', label: 'Distributor stock', badge: waitingCount || null },
          { value: 'record', label: 'My record' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {closed ? (
        <StatusBanner accent="amber" icon={sym('lock', 'lock')} title="Month closed" text={`${prettyMonth(month)} is closed for secondary sales and stock counts. Only an Admin can reopen it.`} />
      ) : null}
      {tab === 'stock' ? <DistributorStockPanel month={month} locked={closed} /> : <SecondarySalesPanel month={month} locked={closed} />}
    </ScreenShell>
  );
}
