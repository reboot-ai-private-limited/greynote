import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { SelectField } from '@/components/select-field';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { SECONDARY_STATE_TEXT, getTeamStock, type SecondaryState, type TeamStock } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf } from '@/offline/day';

const STATE_ACCENT: Record<SecondaryState, Accent> = { NOT_ENTERED: 'slate', DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

type Show = 'ALL' | 'NOT_SENT' | 'WAITING' | 'APPROVED';
const SHOW: { value: Show; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'NOT_SENT', label: 'Not sent' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
];
const sent = (s: SecondaryState) => s === 'PENDING' || s === 'APPROVED';
const matches = (s: SecondaryState, show: Show) => (show === 'ALL' ? true : show === 'NOT_SENT' ? !sent(s) : show === 'WAITING' ? s === 'PENDING' : s === 'APPROVED');

/**
 * Team → Secondary sales (docs/mobile/team.md): for a month, who has sent their secondary and who has not, with the chemists and distributors that still
 * have no stock count. Tap a person for their secondary stock. A month a direct report sent is decided in Approvals.
 */
export default function TeamStockScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= fy.lastMonth ? picked : lastMonth;
  const [show, setShow] = useState<Show>('ALL');

  const list = useCachedFetch<TeamStock>(`team-stock:${fy.year}:${month}`, () => getTeamStock({ month, scope: 'all' }));
  const data = list.data;
  const rows = (data?.items ?? []).filter((r) => matches(r.secondary, show));

  return (
    <ScreenShell title="Secondary sales" subtitle="Who has sent their month" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      <View style={styles.filters}>
        <SelectField label="Show" options={SHOW} value={show} onChange={setShow} />
      </View>
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s secondary sales.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={2} /> : null}
      {data && rows.length === 0 ? <Notice tone="info">{show === 'ALL' ? 'Nobody in your team yet.' : 'Nothing matches.'}</Notice> : null}
      {data && rows.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length}`}</ThemedText> : null}

      {rows.map((r) => (
        <InfoCard key={r.user.id}>
          <View style={styles.row}>
            <Avatar name={r.user.name} accent={STATE_ACCENT[r.secondary]} size={40} />
            <View style={styles.grow}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                onPress={() => router.push({ pathname: '/team-secondary', params: { userId: r.user.id, who: r.user.name, month } })}>
                {`${r.user.name} · ${r.user.employeeCode}`}
              </ThemedText>
              {r.missingOutlets.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">{`${r.missingOutlets.length} outlet${r.missingOutlets.length === 1 ? '' : 's'} with no stock count`}</ThemedText>
              ) : null}
              {r.secondary === 'APPROVED' ? <ThemedText type="small" themeColor="textSecondary">{`${r.secondaryUnits ?? 0} units`}</ThemedText> : null}
            </View>
            <Pill text={r.waitingOnYou ? 'Waiting for you' : SECONDARY_STATE_TEXT[r.secondary]} accent={r.waitingOnYou ? 'amber' : STATE_ACCENT[r.secondary]} />
          </View>
          {r.waitingOnYou ? (
            <ThemedText type="small" themeColor="primary" onPress={() => router.push('/(tabs)/team')}>
              Decide in Approvals →
            </ThemedText>
          ) : null}
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, gap: 2 },
});
