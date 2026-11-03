import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { ScreenShell } from '@/components/screen-shell';
import { SecondarySalesPanel } from '@/components/secondary-sales-panel';
import { ThemedText } from '@/components/themed-text';
import { InfoCard } from '@/components/ui-cards';
import { useFinancialYear } from '@/lib/financial-year';
import { monthOf } from '@/offline/day';

/**
 * A manager editing a team member's monthly secondary (docs/mobile/secondary-and-targets.md). The server lets a manager act for
 * anyone in their downline and records the figures as approved; a month past its stock deadline stays closed for a manager
 * (`MONTH_CLOSED`) unless Admin reopens it or allows a late entry. Params: `userId`, `who` (their name) and optionally `month`.
 */
export default function TeamSecondaryScreen() {
  const { userId, who, month: monthParam } = useLocalSearchParams<{ userId: string; who?: string; month?: string }>();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? (monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : lastMonth));
  const name = who && who.length > 0 ? who : 'Team member';

  return (
    <ScreenShell title="Edit secondary" subtitle={name}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      <SecondarySalesPanel month={month} locked={false} forUser={{ id: String(userId), name }} />
    </ScreenShell>
  );
}
