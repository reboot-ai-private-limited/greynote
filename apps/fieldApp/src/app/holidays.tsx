import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { apiGet } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, formatWhen, monthOf, prettyDay, weeklyOffIndex } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

type Holiday = { id: string; name: string; date: string; scope: 'NATIONAL' | 'ZONE' | 'HQ' };
const SCOPE_LABEL: Record<Holiday['scope'], string> = { NATIONAL: 'National', ZONE: 'Zone', HQ: 'HQ' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Holiday List (PRD §6.2): the National, Zone and HQ holidays that apply to you, a month at a time. The weekly
 * off day is a rule, not a holiday row, so it is noted instead. The last list stays on the phone for offline use.
 */
export default function HolidaysScreen() {
  const fy = useFinancialYear();
  const config = useCachedSource<ConfigSnapshot>('config');
  const [picked, setPicked] = useState<string | null>(null);

  const start = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const month = clamp(picked ?? start);
  const days = datesInMonth(month);
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const list = useCachedFetch<Holiday[]>(`holidays:${month}`, () => apiGet<Holiday[]>(`/hr/holidays?from=${first}&to=${last}`, { auth: true }));
  const holidays = [...(list.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const offIndex = weeklyOffIndex(config.data?.settings.WEEKLY_OFF_DAY);

  return (
    <ScreenShell title="Holiday List" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={fy.lastMonth} />
      {offIndex !== null ? (
        <ThemedText type="small" themeColor="textSecondary">{`Weekly off: every ${WEEKDAYS[offIndex]}.`}</ThemedText>
      ) : null}
      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.stale && list.fetchedAt ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}

      {list.loading && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : holidays.length === 0 ? (
        <Notice tone="info">{list.data ? 'No holidays this month.' : 'Connect once to load the holidays.'}</Notice>
      ) : (
        holidays.map((h) => (
          <ThemedView key={h.id} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{h.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`${prettyDay(h.date)} · ${SCOPE_LABEL[h.scope]}`}
            </ThemedText>
          </ThemedView>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
