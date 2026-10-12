import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type Tool = { title: string; about: string; href: Href };

/** What a manager can open besides the approvals lists. */
const TOOLS: Tool[] = [
  { title: 'Team reports', about: 'Your team’s daily reports, sales and plan compliance by month.', href: '/team-reports' },
  { title: 'Late submissions', about: 'Let someone submit a plan after its deadline.', href: '/late-grants' },
];

/** Shortcuts on the Team tab to the manager-only screens. */
export function TeamTools() {
  return (
    <View style={styles.stack}>
      {TOOLS.map((t) => (
        <Pressable key={t.title} accessibilityRole="button" accessibilityLabel={`${t.title}. ${t.about}`} onPress={() => router.push(t.href)}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.text}>
              <ThemedText type="smallBold">{t.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t.about}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" themeColor="textSecondary">
              ›
            </ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, padding: Spacing.three },
  text: { flex: 1, gap: Spacing.half },
});
