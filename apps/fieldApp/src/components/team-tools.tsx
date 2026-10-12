import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';

import { ThemedText } from './themed-text';

const sym = (ios: string, android: string): SymbolViewProps['name'] => ({ ios, android, web: android }) as SymbolViewProps['name'];

type Tool = { title: string; about: string; href: Href; icon: SymbolViewProps['name']; accent: Accent };

/** What a manager can open besides the approvals lists. */
const TOOLS: Tool[] = [
  { title: 'Team reports', about: 'Daily reports, sales and plan compliance', href: '/team-reports', icon: sym('chart.bar', 'bar_chart'), accent: 'blue' },
  { title: 'Late submissions', about: 'Let someone send a plan or expenses late', href: '/late-grants', icon: sym('clock.badge.checkmark', 'schedule'), accent: 'amber' },
  { title: 'Unblock', about: 'Clear a block for a missed report', href: '/unblock', icon: sym('lock.open', 'lock_open'), accent: 'purple' },
];

/** Shortcuts on the Team tab to the manager-only screens, as the same pastel tiles Home uses. */
export function TeamTools() {
  const { columns } = useResponsive();
  // Two across on a phone, three on a tablet; the padding on each cell makes the gap between tiles.
  const across = Math.min(columns, 3);
  return (
    <View style={styles.grid}>
      {TOOLS.map((t) => {
        const c = Accents[t.accent];
        return (
          <View key={t.title} style={{ width: `${100 / across}%`, padding: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t.title}. ${t.about}`}
              onPress={() => router.push(t.href)}
              style={({ pressed }) => [styles.tile, { backgroundColor: c.bg, borderColor: c.border }, pressed && styles.pressed]}>
              <View style={[styles.chip, { backgroundColor: c.solid }]}>
                <SymbolView name={t.icon} size={22} tintColor="#FFFFFF" />
              </View>
              <View style={styles.text}>
                <ThemedText type="smallBold" numberOfLines={2} style={styles.title}>
                  {t.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={styles.about}>
                  {t.about}
                </ThemedText>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  tile: { minHeight: 128, borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, justifyContent: 'space-between', gap: Spacing.two },
  pressed: { opacity: 0.75 },
  chip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { gap: Spacing.half },
  title: { fontSize: 15, lineHeight: 20 },
  about: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
});
