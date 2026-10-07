import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeatureTile } from '@/components/feature-tile';
import { PrimaryButton } from '@/components/primary-button';
import { SyncChip } from '@/components/sync-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TodayCard } from '@/components/today-card';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { FEATURES, SECTIONS, type Feature } from '@/features/catalog';
import { lockReason, useDayGate } from '@/hooks/use-day-gate';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useResponsive } from '@/hooks/use-responsive';

const SECTION_TITLES: Record<(typeof SECTIONS)[number], string> = {
  DCR: 'Daily Call Report',
  Marketing: 'Marketing',
  Resources: 'Resources',
  Utility: 'Utility',
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Home (PRD §6.2): who you are, today's Tour Plan, and the four quadrants of tiles. A tile that
 * today's plan or a compliance block locks stays visible and says why when tapped (HLD 10) — the
 * server re-checks everything at Submit, so this is a UX gate only.
 */
export default function HomeScreen() {
  const user = useCurrentUser();
  const gate = useDayGate();
  const { columns } = useResponsive();

  function open(feature: Feature) {
    // The Resources tile is the Docs tab itself.
    if (feature.key === 'documents') router.navigate('/docs');
    else router.push({ pathname: '/feature/[key]', params: { key: feature.key } });
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={styles.greeting} numberOfLines={1}>
                Hello, {user.name || 'there'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user.employeeCode} · {user.designation}
              </ThemedText>
            </View>
            <PrimaryButton
              label="Profile"
              variant="text"
              onPress={() => router.push('/profile')}
            />
          </View>

          <SyncChip />
          <TodayCard />

          {SECTIONS.map((section) => (
            <View key={section} style={styles.section}>
              <ThemedText type="smallBold">{SECTION_TITLES[section]}</ThemedText>
              {chunk(
                FEATURES.filter((f) => f.section === section),
                columns,
              ).map((row) => (
                <View key={row[0]!.key} style={styles.row}>
                  {row.map((feature) => (
                    <FeatureTile
                      key={feature.key}
                      feature={feature}
                      lockedReason={lockReason(feature, gate)}
                      onOpen={() => open(feature)}
                      onLockedPress={(reason) => Alert.alert(`${feature.title} is locked`, reason)}
                    />
                  ))}
                  {/* Keep the last row's tiles the same width as the others. */}
                  {Array.from({ length: columns - row.length }, (_, i) => (
                    <View key={`pad-${i}`} style={styles.flex} />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  greeting: { fontSize: 20, lineHeight: 26 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
});
