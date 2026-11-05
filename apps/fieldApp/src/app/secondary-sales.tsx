import { useEffect, useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { PillToggle } from '@/components/pill-toggle';
import { ScreenShell } from '@/components/screen-shell';
import { DistributorStockPanel, MyRecordPanel } from '@/components/secondary-sales-panel';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, StatusBanner, sym } from '@/components/ui-cards';
import { useFinancialYear } from '@/lib/financial-year';
import { noteStockApprovalOn, usePublicFlags } from '@/lib/public-config';
import { useSessionUser } from '@/lib/session';
import { getStockCounts, isUnfinishedCount, type StockCountsMonth } from '@/lib/stock-counts';
import { useRecords } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth, stockDeadlineDay, stockMonthClosed, stockMonthToCount } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

type Tab = 'stock' | 'record';

/**
 * Secondary Sales: count your distributors' opening and closing stock by product (which drives your monthly achievement at PTS,
 * works offline via `MONTHLY_STOCK`). My secondary record only shows what those counts come to: nothing is entered, uploaded or
 * submitted there. The server takes entries for a month until its stock deadline, so a month two or more back is shown closed here
 * and the previous one is left to the server.
 *
 * While the Admin setting `STOCK_COUNT_APPROVAL` is on (docs/mobile/secondary-and-targets.md), a count is a draft until the month is
 * submitted to the manager.
 */
export default function SecondarySalesScreen() {
  const fy = useFinancialYear();
  const me = useSessionUser();
  const config = useCachedSource<ConfigSnapshot>('config');
  const { records } = useRecords(['MONTHLY_STOCK']);
  const waitingCount = records.filter((r) => !r.deleted && r.status !== 'SYNCED').length;
  const syncedCount = records.filter((r) => r.status === 'SYNCED').length;

  // A month that has not started cannot take entries, so the stepper stops at this month (or the end of a past year).
  const thisMonth = monthOf(fy.today);
  const lastMonth = fy.isPast ? fy.lastMonth : thisMonth;
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stock');
  const deadlineDay = stockDeadlineDay(config.data?.settings.MONTHLY_STOCK_DEADLINE_DAY);
  // Until the stock deadline day of this month has passed, the month being counted is still the previous one.
  const month = clamp(picked ?? (fy.isPast ? lastMonth : stockMonthToCount(fy.today, deadlineDay)));
  const closed = !fy.isPast && stockMonthClosed(month, fy.today, deadlineDay);

  const userId = me?.id ?? '';
  const counts = useCachedFetch<StockCountsMonth>(`stock-counts:${fy.year}:${userId}:${month}`, () => getStockCounts(userId, month), syncedCount);
  // Only approval leaves a count unfinished, so one here shows the setting is on even before the server says so.
  const unfinished = (counts.data?.distributors ?? []).some((d) => isUnfinishedCount(d.status));
  const { stockCountApproval } = usePublicFlags();
  useEffect(() => {
    if (unfinished) noteStockApprovalOn();
  }, [unfinished]);
  const approvalOn = stockCountApproval || unfinished;

  return (
    <ScreenShell title="Secondary Sales" subtitle={approvalOn ? 'Count distributor stock by product and submit the month' : 'Count distributor stock by product'}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      <PillToggle
        options={[
          { value: 'stock', label: 'Distributor stock', badge: waitingCount || null },
          { value: 'record', label: 'My secondary record' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {closed ? (
        <StatusBanner accent="amber" icon={sym('lock', 'lock')} title="Month closed" text={`${prettyMonth(month)} is closed for secondary sales and stock counts. Only an Admin can reopen it.`} />
      ) : null}
      {tab === 'stock' ? (
        <DistributorStockPanel month={month} locked={closed} approval={{ on: approvalOn, data: counts.data, reload: counts.reload }} />
      ) : (
        <MyRecordPanel month={month} />
      )}
    </ScreenShell>
  );
}
