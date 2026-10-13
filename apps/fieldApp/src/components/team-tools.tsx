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
  { title: 'Today', about: 'Who is working, reported or missing', href: '/team-today', icon: sym('sun.max', 'today'), accent: 'green' },
  { title: 'People', about: 'Your team, and a page for each person', href: '/team-people', icon: sym('person.2', 'groups'), accent: 'sky' },
  { title: 'Overview', about: 'Plans, reports, calls and sales for a month', href: '/team-overview', icon: sym('chart.pie', 'pie_chart'), accent: 'indigo' },
  { title: 'Plans', about: 'Daily plans for any day, tomorrow too', href: '/team-plans', icon: sym('calendar', 'event_note'), accent: 'teal' },
  { title: 'Leave calendar', about: 'Who is away this month', href: '/team-leaves', icon: sym('calendar.badge.clock', 'event_busy'), accent: 'pink' },
  { title: 'Orders', about: 'Orders placed by your team', href: '/team-orders', icon: sym('cart', 'shopping_cart'), accent: 'orange' },
  { title: 'Stock & secondary', about: 'Who still has to send their month', href: '/team-stock', icon: sym('shippingbox', 'inventory_2'), accent: 'lime' },
  { title: 'Team reports', about: 'Daily reports, sales and plan compliance', href: '/team-reports', icon: sym('chart.bar', 'bar_chart'), accent: 'blue' },
  { title: 'Visit targets', about: 'How often each doctor is visited', href: '/team-doctors', icon: sym('target', 'track_changes'), accent: 'red' },
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
  tile: { flex: 1, minHeight: 128, borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, justifyContent: 'space-between', gap: Spacing.two },
  pressed: { opacity: 0.75 },
  chip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { gap: Spacing.half },
  title: { fontSize: 15, lineHeight: 20 },
  about: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
});
