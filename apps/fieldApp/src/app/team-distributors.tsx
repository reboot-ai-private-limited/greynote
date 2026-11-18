import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PagedList } from '@/components/team/paged-list';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { holdersText, listTeamDistributorsPage, type TeamDistributor } from '@/lib/team-visibility';

/** Distributors (managers): distributors assigned to anyone in your team. Assignees outside your team are never shown. */
export default function TeamDistributorsScreen() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  return (
    <ScreenShell title="Distributors" subtitle="Distributors held by the people in your team">
      <PagedList<TeamDistributor>
        fetchPage={(p, q) => listTeamDistributorsPage(p, q, typeof userId === 'string' && userId !== '' ? userId : undefined)}
        searchLabel="Search by name, GST or contact"
        emptyText="Nobody in your team has a distributor yet."
        offlineText="Connect to the internet to see your team’s distributors."
        renderItem={(d) => (
          <InfoCard key={d.id}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <ThemedText type="smallBold">{d.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[d.contactPerson, d.mobile, d.gstNumber].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              {d.assignedTo.length > 1 ? <Pill text={`${d.assignedTo.length} MRs`} accent="blue" /> : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Held by {holdersText(d.assignedTo)}
            </ThemedText>
          </InfoCard>
        )}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, grow: { flex: 1 } });
