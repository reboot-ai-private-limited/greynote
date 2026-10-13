import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { UserFilterBanner, useUserFilter } from '@/components/team/user-filter';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { SECONDARY_STATE_TEXT, getTeamStock, type SecondaryState, type TeamScopeFilter, type TeamStock } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf } from '@/offline/day';

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'All my team' },
  { value: 'direct', label: 'My direct reports' },
  { value: 'indirect', label: 'Their teams' },
];

const STATE_ACCENT: Record<SecondaryState, Accent> = { NOT_ENTERED: 'slate', DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

type Focus = 'ALL' | 'MISSING' | 'WAITING';

/**
 * Team → Stock & secondary (docs/mobile/team.md): per person for a month, the chemists and distributors with no stock count
 * and where their secondary sales stand. A report to chase people with, not a block. A month a direct report has sent is
 * decided in the Team tab's Inbox (kind Secondary Sales).
 */
export default function TeamStockScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= fy.lastMonth ? picked : lastMonth;
  const [scope, setScope] = useState<TeamScopeFilter>('all');
  const [focus, setFocus] = useState<Focus>('ALL');

  const { userId, clear } = useUserFilter();
  const list = useCachedFetch<TeamStock>(`team-stock:${fy.year}:${month}:${scope}:${focus}:${userId ?? ''}`, () =>
    getTeamStock({ month, scope, userId, missingStock: focus === 'MISSING' ? true : undefined, secondary: focus === 'WAITING' ? 'PENDING' : undefined }),
  );
  const data = list.data;

  return (
    <ScreenShell title="Stock & secondary" subtitle="Who still has to send their month" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <UserFilterBanner userId={userId} onClear={clear} />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      {userId ? null : <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />}
      <ChoiceChips
        options={[{ value: 'ALL' as const, label: 'All' }, { value: 'MISSING' as const, label: 'Missing stock' }, { value: 'WAITING' as const, label: 'Sent to me' }]}
        value={focus}
        onChange={setFocus}
      />
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s stock.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={2} /> : null}

      {data ? (
        <SummaryStrip
          items={[
            { label: 'People', value: data.tiles.total, accent: 'blue' },
            { label: 'Missing stock', value: data.tiles.withMissingStock, accent: data.tiles.withMissingStock > 0 ? 'amber' : 'slate' },
            { label: 'Sent to me', value: data.tiles.secondary.PENDING ?? 0, accent: (data.tiles.secondary.PENDING ?? 0) > 0 ? 'orange' : 'slate' },
          ]}
        />
      ) : null}
      {data && data.items.length === 0 ? <Notice tone="info">Nobody to chase for this month.</Notice> : null}

      {(data?.items ?? []).map((r) => (
        <InfoCard key={r.user.id}>
          <View style={styles.row}>
            <Avatar name={r.user.name} accent={STATE_ACCENT[r.secondary]} size={40} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" numberOfLines={1}>{`${r.user.name} · ${r.user.employeeCode}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{r.missingOutlets.length === 0 ? 'Every outlet has a stock count' : `${r.missingOutlets.length} outlet${r.missingOutlets.length === 1 ? '' : 's'} with no stock count`}</ThemedText>
            </View>
            <Pill text={r.waitingOnYou ? 'Waiting for you' : SECONDARY_STATE_TEXT[r.secondary]} accent={r.waitingOnYou ? 'amber' : STATE_ACCENT[r.secondary]} />
          </View>
          {r.missingOutlets.slice(0, 5).map((m) => (
            <ThemedText key={m.id} type="small" themeColor="textSecondary">{`${m.type === 'CHEMIST' ? 'Chemist' : 'Distributor'} · ${m.name}`}</ThemedText>
          ))}
          {r.missingOutlets.length > 5 ? <ThemedText type="small" themeColor="textSecondary">{`…and ${r.missingOutlets.length - 5} more`}</ThemedText> : null}
          <View style={styles.row}>
            <ThemedText type="small" themeColor="primary" onPress={() => router.push({ pathname: '/team-member', params: { id: r.user.id } })}>
              View person →
            </ThemedText>
            {r.waitingOnYou ? (
              <ThemedText type="small" themeColor="primary" onPress={() => router.push('/(tabs)/team')}>
                Decide in Team inbox →
              </ThemedText>
            ) : null}
          </View>
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1, gap: 2 },
});
