import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { featureByKey } from '@/features/catalog';

/**
 * Stand-in for a Home tile whose real screen isn't built yet. Each real screen replaces this
 * route with its own file (e.g. src/app/daily-plan.tsx) and the tile points at it; delete this
 * once every tile has one.
 */
export default function FeaturePlaceholder() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const feature = featureByKey(key);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{feature?.title ?? 'Not found'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {feature?.about ?? 'This screen doesn’t exist.'}
          </ThemedText>
          {feature ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Coming soon</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Planned for build stage {feature.stage}.
              </ThemedText>
            </ThemedView>
          ) : null}
          <PrimaryButton label="Back" onPress={() => router.back()} />
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
