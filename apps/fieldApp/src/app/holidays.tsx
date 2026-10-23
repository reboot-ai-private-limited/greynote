import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { apiGet } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, formatWhen, monthOf, prettyDay, prettyMonth, weeklyOffIndex } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

/** `groupId` is shared by the days of one multi-day holiday (docs/mobile/holidays.md rule 8); null for a one-day holiday and older rows. */
type Holiday = { id: string; name: string; date: string; scope: 'NATIONAL' | 'ZONE' | 'HQ'; groupId?: string | null };
type HolidayLine = { key: string; name: string; scope: Holiday['scope']; from: string; to: string; days: number };

/** One line per holiday: the days that share a `groupId` become a range, every other row stays as it is. `rows` are oldest first. */
function groupHolidays(rows: Holiday[]): HolidayLine[] {
  const lines: HolidayLine[] = [];
  const byGroup = new Map<string, HolidayLine>();
  for (const h of rows) {
    const line = h.groupId ? byGroup.get(h.groupId) : undefined;
    if (line) {
      line.to = h.date;
      line.days += 1;
    } else {
      const next: HolidayLine = { key: h.groupId ?? h.id, name: h.name, scope: h.scope, from: h.date, to: h.date, days: 1 };
      if (h.groupId) byGroup.set(h.groupId, next);
      lines.push(next);
    }
  }
  return lines;
}
const SCOPE_LABEL: Record<Holiday['scope'], string> = { NATIONAL: 'National', ZONE: 'Zone', HQ: 'HQ' };
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Holiday List (PRD §6.2): every National, Zone and HQ holiday that applies to you in the financial year, under month
 * headings; the days already gone are greyed. The weekly off day is a rule, not a holiday row, so it is noted instead.
 * The last list stays on the phone for offline use.
 */
export default function HolidaysScreen() {
  const fy = useFinancialYear();
  const config = useCachedSource<ConfigSnapshot>('config');

  const first = datesInMonth(fy.firstMonth)[0]!;
  const last = datesInMonth(fy.lastMonth).at(-1)!;

  const list = useCachedFetch<Holiday[]>(`holidays:${first}:${last}`, () => apiGet<Holiday[]>(`/hr/holidays?from=${first}&to=${last}`, { auth: true }));
  const holidays = [...(list.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = groupHolidays(holidays).reduce<{ month: string; lines: HolidayLine[] }[]>((groups, h) => {
    const month = monthOf(h.from);
    if (groups.at(-1)?.month === month) groups.at(-1)!.lines.push(h);
    else groups.push({ month, lines: [h] });
    return groups;
  }, []);
  const offIndex = weeklyOffIndex(config.data?.settings.WEEKLY_OFF_DAY);

  return (
    <ScreenShell title="Holiday List" subtitle={`${prettyMonth(fy.firstMonth)} – ${prettyMonth(fy.lastMonth)}`} onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      {offIndex !== null ? (
        <ThemedText type="small" themeColor="textSecondary">{`Weekly off: every ${WEEKDAYS[offIndex]}.`}</ThemedText>
      ) : null}
      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.stale && list.fetchedAt ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}

      {list.loading && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : holidays.length === 0 ? (
        <Notice tone="info">{list.data ? 'No holidays this financial year.' : 'Connect once to load the holidays.'}</Notice>
      ) : (
        byMonth.map((g) => (
          <View key={g.month} style={styles.month}>
            <ThemedText type="smallBold" themeColor="textSecondary">{prettyMonth(g.month)}</ThemedText>
            {g.lines.map((h) => (
              <ThemedView key={h.key} type="backgroundElement" style={[styles.card, h.to < fy.today && styles.past]}>
                <ThemedText type="smallBold">{h.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`${h.days > 1 ? `${prettyDay(h.from)} – ${prettyDay(h.to)} (${h.days} days)` : prettyDay(h.from)} · ${SCOPE_LABEL[h.scope]}`}
                </ThemedText>
              </ThemedView>
            ))}
          </View>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  month: { gap: Spacing.two },
  past: { opacity: 0.55 },
});
