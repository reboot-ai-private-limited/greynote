import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { StockCountsCard } from '@/components/stock-counts-card';
import { ThemedText } from '@/components/themed-text';
import { InfoCard } from '@/components/ui-cards';
import { useFinancialYear } from '@/lib/financial-year';
import { getStockCounts, type StockCountsMonth } from '@/lib/stock-counts';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf } from '@/offline/day';

/**
 * A team member's month of secondary stock, read only (docs/mobile/secondary-and-targets.md, 2026-11-05): a manager never enters
 * it. They decide the month in Approvals. Params: `userId`, `who` (their name) and optionally `month`.
 */
export default function TeamSecondaryScreen() {
  const { userId, who, month: monthParam } = useLocalSearchParams<{ userId: string; who?: string; month?: string }>();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? (monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : lastMonth));
  const name = who && who.length > 0 ? who : 'Team member';
  const counts = useCachedFetch<StockCountsMonth>(`secondary-stock:${fy.year}:${String(userId)}:${month}`, () => getStockCounts(String(userId), month));
  const data = counts.data?.month === month ? counts.data : null;

  return (
    <ScreenShell title="Secondary stock" subtitle={name} onRefresh={counts.reload} refreshing={counts.refreshing}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      {counts.error ? <Notice tone="danger">{counts.error}</Notice> : null}
      {data ? (
        <InfoCard>
          <StockCountsCard data={data} />
        </InfoCard>
      ) : null}
    </ScreenShell>
  );
}
