import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatRupees } from '@/lib/money';
import { planChip, reportChip, type BoardRow } from '@/lib/team-section';

import { PrimaryButton } from '../primary-button';
import { ThemedText } from '../themed-text';
import { Avatar, InfoCard, Pill } from '../ui-cards';
import { DoctorLines } from './doctor-lines';

const ROUTE_TYPE: Record<string, string> = { HQ: 'HQ', EX_STATION: 'Ex-station', OUT_STATION: 'Out-station' };

/**
 * One person on the team board for a day: where they go (routes by name), who they work with, the doctors by name with ✓ / – / ✗, what else
 * they did, and the report. Tapping the name opens their page. At the end of the day the last line reads "visited 4 of 5 doctors".
 */
export function BoardCard({ row, past, level = 0 }: { row: BoardRow; past: boolean; level?: number }) {
  const plan = row.plan;
  const chip = row.onLeave ? { text: 'On leave', accent: 'purple' as const } : planChip(plan?.status);
  const report = reportChip(row.report?.status);
  const field = plan ? !['MEETING', 'CONFERENCE', 'STRIKE'].includes(plan.workingType) : false;
  const s = row.summary;
  return (
    <View style={level > 0 ? { marginLeft: Math.min(level, 3) * 12, paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: '#CBD5E1' } : undefined}>
      <InfoCard>
        <View style={styles.head}>
          <Avatar name={row.user.name} accent={row.onLeave ? 'purple' : 'blue'} size={36} />
          <View style={styles.grow}>
            <PrimaryButton label={row.user.name} variant="text" onPress={() => router.push({ pathname: '/team-member', params: { id: row.user.id } })} style={styles.name} />
            <ThemedText type="small" themeColor="textSecondary">{row.user.employeeCode}</ThemedText>
          </View>
          <Pill text={chip.text} accent={chip.accent} />
        </View>
        {plan && !row.onLeave ? (
          <>
            <ThemedText type="small">
              {field
                ? plan.routes.length > 0
                  ? plan.routes.map((r) => `${r.name} (${ROUTE_TYPE[r.routeType] ?? r.routeType})`).join(', ')
                  : 'No route'
                : plan.workingType.replace(/_/g, ' ').toLowerCase()}
            </ThemedText>
            {plan.workWith.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`With ${plan.workWith.map((p) => p.label).join(', ')}`}</ThemedText> : null}
            {plan.remarks ? <ThemedText type="small" themeColor="textSecondary">{`“${plan.remarks}”`}</ThemedText> : null}
          </>
        ) : null}
        {!row.onLeave ? <DoctorLines planned={row.doctors.planned} alsoVisited={row.doctors.alsoVisited} past={past} /> : null}
        {!row.onLeave && field ? (
          <ThemedText type="small" themeColor={past && s.missed > 0 ? 'danger' : 'textSecondary'}>
            {[
              s.planned > 0 ? `Visited ${s.visited} of ${s.planned} doctors${past && s.missed > 0 ? `, ${s.missed} missed` : ''}` : 'No doctors planned',
              row.chemistCalls > 0 ? `${row.chemistCalls} chemist${row.chemistCalls === 1 ? '' : 's'}` : null,
              row.followups > 0 ? `${row.followups} follow-up${row.followups === 1 ? '' : 's'}` : null,
              row.orders.count > 0 ? `${row.orders.count} order${row.orders.count === 1 ? '' : 's'} ${formatRupees(row.orders.amountPaise)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        ) : null}
        {!row.onLeave ? <Pill text={report.text} accent={report.accent} /> : null}
      </InfoCard>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  name: { alignSelf: 'flex-start' },
});
