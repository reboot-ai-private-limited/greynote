import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';

import { ThemedText } from '../themed-text';
import { RowCard, sym } from '../ui-cards';

type Item = { title: string; about: string; href: Href; icon: ReturnType<typeof sym>; accent: Accent };

const ITEMS: Item[] = [
  { title: 'Expenses', about: 'TA, DA and other claims by person, who has not sent', href: '/team-expenses', icon: sym('indianrupeesign.circle', 'payments'), accent: 'amber' },
  { title: 'Secondary sales', about: 'Who has sent their month, who has not', href: '/team-stock', icon: sym('shippingbox', 'inventory_2'), accent: 'lime' },
  { title: 'Leave requests', about: 'Waiting and approved, from your team', href: '/team-leaves', icon: sym('calendar.badge.clock', 'event_busy'), accent: 'pink' },
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
 * Team → Reports: three month reports (expenses, secondary sales, leave requests) and a "More" row. Today's state, plans and daily reports are on the Team board and on each
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
