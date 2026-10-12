import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { IconChip, InfoCard, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getTeamOrders, type TeamOrderRow, type TeamOrders, type TeamScopeFilter } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, monthOf, prettyDay } from '@/offline/day';

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'direct', label: 'Direct reports' },
  { value: 'indirect', label: 'Further down' },
];

type Filter = 'ALL' | TeamOrderRow['status'];
const STATUS_ACCENT: Record<TeamOrderRow['status'], Accent> = { PLACED: 'orange', DONE: 'green', CANCELLED: 'red' };
const STATUS_TEXT: Record<TeamOrderRow['status'], string> = { PLACED: 'Placed', DONE: 'Done', CANCELLED: 'Cancelled' };

/**
 * Team → Orders (docs/mobile/team.md): your team's orders for a month, newest first, with the totals. A manager only reads here:
 * a distributor order is marked Done or Cancelled by the MR who placed it, and a chemist order is information only.
 */
export default function TeamOrdersScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= fy.lastMonth ? picked : lastMonth;
  const [scope, setScope] = useState<TeamScopeFilter>('all');
  const [status, setStatus] = useState<Filter>('ALL');

  const days = datesInMonth(month);
  const from = days[0]!;
  const to = days[days.length - 1]!;
  const list = useCachedFetch<TeamOrders>(`team-orders:${fy.year}:${month}:${scope}:${status}`, () => getTeamOrders({ from, to, scope, status: status === 'ALL' ? undefined : status }));
  const data = list.data;

  return (
    <ScreenShell title="Team orders" subtitle="Orders placed by your team" onRefresh={list.reload} refreshing={list.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />
      <ChoiceChips
        options={[{ value: 'ALL' as const, label: 'All' }, { value: 'PLACED' as const, label: 'Placed' }, { value: 'DONE' as const, label: 'Done' }, { value: 'CANCELLED' as const, label: 'Cancelled' }]}
        value={status}
        onChange={setStatus}
      />
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s orders.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !data ? <Skeleton cards={3} lines={2} /> : null}

      {data ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Orders', value: data.totals.count, accent: 'orange' },
              { label: 'Placed + Done', value: formatRupees(data.totals.amountPaise), accent: 'green' },
            ]}
          />
          {data.truncated ? <Notice tone="warning">One person has more than 500 orders in this month, so the totals are short. Pick a shorter window or one person.</Notice> : null}
        </>
      ) : null}
      {data && data.items.length === 0 ? <Notice tone="info">No orders in this month.</Notice> : null}

      {(data?.items ?? []).map((o) => {
        const chemist = o.outlet.type === 'CHEMIST';
        return (
          <InfoCard key={o.id}>
            <View style={styles.row}>
              <IconChip icon={chemist ? sym('cross.case', 'medical_services') : sym('building.2', 'domain')} accent={chemist ? 'teal' : 'orange'} />
              <View style={styles.grow}>
                <ThemedText type="smallBold" numberOfLines={1}>{`${o.user.name} · ${o.outlet.name}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${chemist ? 'Chemist' : 'Distributor'} · ${prettyDay(o.orderDate)} · ${o.itemCount} product${o.itemCount === 1 ? '' : 's'}`}</ThemedText>
              </View>
              <ThemedText type="smallBold">{formatRupees(o.totalAmountPaise)}</ThemedText>
            </View>
            <Pill text={chemist ? 'Info only' : STATUS_TEXT[o.status]} accent={chemist ? 'slate' : STATUS_ACCENT[o.status]} />
            {o.remarks ? <ThemedText type="small" themeColor="textSecondary">{o.remarks}</ThemedText> : null}
          </InfoCard>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
