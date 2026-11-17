import { StyleSheet, View } from 'react-native';

import { PagedList } from '@/components/team/paged-list';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { holdersText, listTeamChemistsPage, type TeamChemist } from '@/lib/team-visibility';

/** Team chemists (managers): every chemist an MR below you holds, with who holds it. Computed by the server; nothing is assigned to you. */
export default function TeamChemistsScreen() {
  return (
    <ScreenShell title="Chemists" subtitle="Chemists held by the people in your team">
      <PagedList<TeamChemist>
        fetchPage={listTeamChemistsPage}
        searchLabel="Search the chemist, or an MR’s name or code"
        emptyText="Nobody in your team holds a chemist yet."
        offlineText="Connect to the internet to see your team’s chemists."
        renderItem={(c) => (
          <InfoCard key={c.id}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <ThemedText type="smallBold">{c.name}</ThemedText>
                {c.address ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {c.address}
                  </ThemedText>
                ) : null}
              </View>
              {c.assignedTo.length > 1 ? <Pill text={`${c.assignedTo.length} MRs`} accent="blue" /> : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Held by {holdersText(c.assignedTo)}
            </ThemedText>
          </InfoCard>
        )}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, grow: { flex: 1 } });
