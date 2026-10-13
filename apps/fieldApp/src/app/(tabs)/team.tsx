import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FyBanner } from '@/components/fy-banner';
import { PillToggle } from '@/components/pill-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ApprovalsPanel } from '@/components/team/approvals-panel';
import { PeoplePanel } from '@/components/team/people-panel';
import { ReportsPanel } from '@/components/team/reports-panel';
import { BottomTabInset, Gradients, Spacing, WideContentWidth } from '@/constants/theme';
import { useApprovalSummary } from '@/lib/team-section';

type Section = 'approvals' | 'people' | 'reports';

/**
 * Team (PRD §7.1, managers only), in three sections: Approvals (what waits on you, and everything your team sent, with filters),
 * People (your team as a list you can drill into, with today's state for each) and Reports (the team-wide views and the few things you
 * set for someone). `?section=` opens one directly. Needs a connection: approvals are decided on the server's live state.
 */
export default function TeamScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(params.section === 'people' || params.section === 'reports' ? params.section : 'approvals');
  const [refreshing, setRefreshing] = useState(false);
  // Changing this remounts the open section, which reads everything again.
  const [round, setRound] = useState(0);

  // The badge: what waits on you and how much of it is overdue (read again whenever this tab is shown).
  const badge = useApprovalSummary();
  const refreshBadge = badge.refresh;
  useFocusEffect(
    useCallback(() => {
      refreshBadge();
    }, [refreshBadge]),
  );

  const refresh = () => {
    setRefreshing(true);
    refreshBadge();
    setRound((r) => r + 1);
    setTimeout(() => setRefreshing(false), 600);
  };

  const waiting = badge.summary?.total ?? null;
  const sections: { value: Section; label: string; badge?: number | null }[] = [
    { value: 'approvals', label: 'Approvals', badge: waiting },
    { value: 'people', label: 'People' },
    { value: 'reports', label: 'Reports' },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <LinearGradient colors={Gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="smallBold" style={styles.headerTitle}>
                Team
              </ThemedText>
              <ThemedText type="small" style={styles.headerSub}>
                Approvals, people and reports for your team
              </ThemedText>
            </View>
            <View style={styles.waiting}>
              <ThemedText type="smallBold" style={styles.waitingNumber}>
                {waiting === null ? '–' : String(waiting)}
              </ThemedText>
              <ThemedText type="small" style={styles.waitingLabel}>
                {badge.summary && badge.summary.overdue > 0 ? `waiting · ${badge.summary.overdue} overdue` : 'waiting'}
              </ThemedText>
            </View>
          </LinearGradient>
          <FyBanner />
          <PillToggle options={sections} value={section} onChange={setSection} />

          {section === 'approvals' ? <ApprovalsPanel key={`a${round}`} summary={badge.summary} refreshSummary={refreshBadge} /> : null}
          {section === 'people' ? <PeoplePanel key={`p${round}`} onShowApprovals={() => setSection('approvals')} /> : null}
          {section === 'reports' ? <ReportsPanel /> : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 20, padding: Spacing.three },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 30 },
  headerSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16 },
  waiting: { alignItems: 'center', borderRadius: Spacing.three, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  waitingNumber: { color: '#FFFFFF', fontSize: 22, lineHeight: 26 },
  waitingLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11, lineHeight: 14 },
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: WideContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
});
