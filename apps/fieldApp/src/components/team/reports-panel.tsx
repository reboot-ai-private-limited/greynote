import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';

import { ThemedText } from '../themed-text';
import { RowCard, sym } from '../ui-cards';

type Item = { title: string; about: string; href: Href; icon: ReturnType<typeof sym>; accent: Accent };
type Group = { title: string; hint: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: 'Daily',
    hint: 'How the team is doing today',
    items: [
      { title: 'Today board', about: 'Who is working, reported or missing', href: '/team-today', icon: sym('sun.max', 'today'), accent: 'green' },
      { title: 'Plans', about: 'Daily plans for any day, tomorrow too', href: '/team-plans', icon: sym('calendar', 'event_note'), accent: 'teal' },
      { title: 'Daily reports', about: 'Each report, with its calls and status', href: '/team-reports', icon: sym('doc.text', 'description'), accent: 'blue' },
    ],
  },
  {
    title: 'Monthly',
    hint: 'The month so far',
    items: [
      { title: 'Monthly overview', about: 'Plans, reports, calls, TA/DA and sales per person', href: '/team-overview', icon: sym('chart.pie', 'pie_chart'), accent: 'indigo' },
      { title: 'Leave calendar', about: 'Who is away this month', href: '/team-leaves', icon: sym('calendar.badge.clock', 'event_busy'), accent: 'pink' },
      { title: 'Orders', about: 'Orders placed by your team', href: '/team-orders', icon: sym('cart', 'shopping_cart'), accent: 'orange' },
      { title: 'Stock & secondary', about: 'Who still has to send their month', href: '/team-stock', icon: sym('shippingbox', 'inventory_2'), accent: 'lime' },
    ],
  },
  {
    title: 'Manage',
    hint: 'Used now and then',
    items: [
      { title: 'Late exceptions', about: 'Let someone send a plan or expenses late, and see what you granted', href: '/late-grants', icon: sym('clock.badge.checkmark', 'schedule'), accent: 'amber' },
      { title: 'Visit targets', about: 'How often each doctor should be visited', href: '/team-doctors', icon: sym('target', 'track_changes'), accent: 'red' },
      { title: 'Unblock', about: 'Clear a block for a missed report', href: '/unblock', icon: sym('lock.open', 'lock_open'), accent: 'purple' },
    ],
  },
];

/**
 * Team → Reports: the team-wide views as one plain list, a line each, in three groups. People and Approvals have their own sections;
 * what is left here is read across the whole team (or, under Manage, set for someone). Each opens its existing screen.
 */
export function ReportsPanel() {
  return (
    <View style={styles.stack}>
      {GROUPS.map((g) => (
        <View key={g.title} style={styles.group}>
          <View style={styles.header}>
            <ThemedText type="smallBold" style={styles.title}>{g.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{g.hint}</ThemedText>
          </View>
          {g.items.map((i) => (
            <RowCard key={i.title} icon={i.icon} accent={i.accent} title={i.title} subtitle={i.about} right={<ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText>} onPress={() => router.push(i.href)} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.four },
  group: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 16, lineHeight: 22 },
});
