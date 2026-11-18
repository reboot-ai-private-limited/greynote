import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';

import { ThemedText } from '../themed-text';
import { RowCard, sym } from '../ui-cards';

type Item = { title: string; about: string; href: Href; icon: ReturnType<typeof sym>; accent: Accent };

const ITEMS: Item[] = [
  { title: 'Monthly overview', about: 'Per person: plans, reports, calls, TA/DA, sales', href: '/team-overview', icon: sym('chart.pie', 'pie_chart'), accent: 'indigo' },
  { title: 'Sales & compliance', about: 'Targets, achievement, plans and reports in', href: '/team-reports', icon: sym('chart.bar', 'bar_chart'), accent: 'blue' },
  { title: 'Stock & secondary', about: 'Who still has to send their month', href: '/team-stock', icon: sym('shippingbox', 'inventory_2'), accent: 'lime' },
  { title: 'Leave calendar', about: 'Who is away this month', href: '/team-leaves', icon: sym('calendar.badge.clock', 'event_busy'), accent: 'pink' },
  { title: 'Orders', about: 'Orders placed by your team', href: '/team-orders', icon: sym('cart', 'shopping_cart'), accent: 'orange' },
];

/** Used now and then, so they sit behind one "More" row. */
const MORE: Item[] = [
  { title: 'Late exceptions', about: 'Let someone send a plan or expenses late', href: '/late-grants', icon: sym('clock.badge.checkmark', 'schedule'), accent: 'amber' },
  { title: 'Unblock', about: 'Clear a block for a missed report', href: '/unblock', icon: sym('lock.open', 'lock_open'), accent: 'purple' },
  { title: 'Team distributors', about: 'Distributors held by your team', href: '/team-distributors', icon: sym('truck.box', 'local_shipping'), accent: 'orange' },
  { title: 'Territory', about: 'Zones, HQs and routes of your team', href: '/team-territory', icon: sym('map', 'map'), accent: 'blue' },
];

const chevron = <ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText>;

/**
 * Team → Reports: the month's team-wide reports as one short list. Today's state, plans and daily reports are on the Team board and on each
 * person's page, so they are not repeated here. The few things used now and then are behind "More".
 */
export function ReportsPanel() {
  const [more, setMore] = useState(false);
  return (
    <View style={styles.stack}>
      {ITEMS.map((i) => (
        <RowCard key={i.title} icon={i.icon} accent={i.accent} title={i.title} subtitle={i.about} right={chevron} onPress={() => router.push(i.href)} />
      ))}
      <RowCard
        icon={sym('ellipsis.circle', 'more_horiz')}
        accent="slate"
        title="More"
        subtitle="Late exceptions · Unblock · Team distributors · Territory"
        right={<ThemedText type="smallBold" themeColor="textSecondary">{more ? '▴' : '▾'}</ThemedText>}
        onPress={() => setMore((m) => !m)}
      />
      {more ? MORE.map((i) => <RowCard key={i.title} icon={i.icon} accent={i.accent} title={i.title} subtitle={i.about} right={chevron} onPress={() => router.push(i.href)} />) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
});
