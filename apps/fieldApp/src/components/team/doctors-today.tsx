import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getTeamMemberDay, type TeamMemberDayDetail } from '@/lib/team-section';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';

import { ThemedText } from '../themed-text';
import { CardSection, sym } from '../ui-cards';

const names = (list: { name: string; since?: string }[]) => list.map((d) => (d.since ? `${d.name} (since ${prettyDay(d.since)})` : d.name));

/**
 * One day of one person in doctors, for their manager: planned, visited, missed that day, what was carried in (since when) and what carries on to the next
 * day, with the month so far. Shows nothing for someone outside your team (the server refuses) or a day with no plan and no calls.
 */
export function DoctorsToday({ userId, date }: { userId: string; date: string }) {
  const fy = useFinancialYear();
  const q = useCachedFetch<TeamMemberDayDetail>(`team-member-day:${fy.year}:${userId}:${date}`, () => getTeamMemberDay(userId, date));
  const d = q.data;
  if (!d) return null;
  const nothing = d.planned.length === 0 && d.alsoVisited.length === 0 && d.carriedIn.length === 0 && d.carriedOn.length === 0;
  if (nothing) return null;
  const visited = d.planned.filter((x) => x.visited).length;
  return (
    <CardSection icon={sym('stethoscope', 'medical_services')} accent="teal" title="Doctors today">
      <ThemedText type="small">{`Planned ${d.planned.length} · Visited ${visited} · Missed ${d.missedToday.length}`}</ThemedText>
      {visited > 0 ? (
        <View style={styles.block}>
          <ThemedText type="smallBold" themeColor="primary">{`✓ Visited (${visited})`}</ThemedText>
          <ThemedText type="small">{d.planned.filter((x) => x.visited).map((x) => x.name).join(', ')}</ThemedText>
        </View>
      ) : null}
      {d.carriedIn.length > 0 ? (
        <View style={styles.block}>
          <ThemedText type="smallBold" themeColor="warning">{`Carried in (${d.carriedIn.length})`}</ThemedText>
          <ThemedText type="small">{names(d.carriedIn).join(', ')}</ThemedText>
        </View>
      ) : null}
      {d.missedToday.length > 0 ? (
        <View style={styles.block}>
          <ThemedText type="smallBold" themeColor="danger">{`Missed ${d.final ? 'today' : 'so far'} (${d.missedToday.length})`}</ThemedText>
          <ThemedText type="small">{d.missedToday.map((x) => x.name).join(', ')}</ThemedText>
        </View>
      ) : null}
      {d.alsoVisited.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Also called, not planned: ${d.alsoVisited.map((x) => x.name).join(', ')}`}</ThemedText> : null}
      <View style={styles.block}>
        <ThemedText type="smallBold" themeColor={d.carriedOn.length > 0 ? 'warning' : 'primary'}>{`${d.final ? 'Carried on to the next day' : 'Carried on so far'} (${d.carriedOn.length})`}</ThemedText>
        {d.carriedOn.length > 0 ? <ThemedText type="small">{names(d.carriedOn).join(', ')}</ThemedText> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Carried in = planned on an earlier day and still not called when this day began. Carried on = still owed when this day ends (carried in + today’s misses − anyone called today). A call on any later day clears it.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{`This month: ${d.month.doctorCalls} doctor calls · ${d.month.missedDays} missed planned visits · ${d.month.carriedNow} carried now`}</ThemedText>
    </CardSection>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2, marginTop: Spacing.one },
});
