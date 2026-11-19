import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { MonthReport } from '@/components/month-report';
import { OwnDownloads } from '@/components/own-downloads';
import { DailyPlanReport, DcrReport, TaDaReport, TpReport } from '@/components/reports';
import { RowCard, sym } from '@/components/ui-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, WideContentWidth } from '@/constants/theme';
import { selectFinancialYear, useFinancialYear } from '@/lib/financial-year';
import { useSessionUser } from '@/lib/session';
import { monthOf } from '@/offline/day';

type Report = 'month' | 'dcr' | 'plans' | 'tada' | 'more';
const REPORTS: { value: Report; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'dcr', label: 'DCR' },
  { value: 'plans', label: 'Plans' },
  { value: 'tada', label: 'TA / DA' },
  { value: 'more', label: 'More' },
];

const MORE: { title: string; about: string; href: Href; icon: ReturnType<typeof sym> }[] = [
  { title: 'Orders', about: 'Your orders, each in detail', href: '/orders', icon: sym('cart', 'shopping_cart') },
  { title: 'Leave', about: 'Your leave requests and balance', href: '/leave', icon: sym('calendar.badge.clock', 'event_busy') },
  { title: 'Gifts', about: 'Gifts set aside for your doctors', href: '/gifts', icon: sym('gift', 'redeem') },
  { title: 'Services', about: 'Doctor service requests', href: '/services', icon: sym('briefcase', 'work') },
  { title: 'Visit targets', about: 'How many visits each doctor still needs', href: '/missed-calls', icon: sym('phone.arrow.up.right', 'call_made') },
  { title: 'Targets', about: 'Your sales targets and achievement', href: '/targets', icon: sym('target', 'track_changes') },
];

/**
 * Reports (PRD §6.3): your past work and where it stands, a month at a time. Follows the financial-year switch
 * (Home → Utility → Financial Year): pick a past year and the months and figures are that year's, read-only.
 */
export default function ReportsScreen() {
  const fy = useFinancialYear();
  const me = useSessionUser();
  const [report, setReport] = useState<Report>('month');
  const [picked, setPicked] = useState<string | null>(null);

  const start = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const month = clamp(picked ?? start);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Reports</ThemedText>
          {/* The financial year is a filter here too: pick a past year and the months below are that year's, starting on its last month. */}
          <ChoiceChips
            options={fy.options.map((o) => ({ value: String(o.year), label: o.year === fy.current ? `${o.label} · current` : o.label }))}
            value={String(fy.year)}
            onChange={(y) => {
              if (!me) return;
              setPicked(null);
              selectFinancialYear(Number(y) === fy.current ? null : Number(y), me.id);
            }}
          />
          <FyBanner />
          <ChoiceChips options={REPORTS} value={report} onChange={setReport} />
          <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={fy.lastMonth} />
          {report === 'more' ? null : <OwnDownloads month={month} />}
          {report === 'month' ? <MonthReport month={month} year={fy.year} /> : null}
          {report === 'dcr' ? <DcrReport month={month} year={fy.year} /> : null}
          {report === 'tada' ? <TaDaReport month={month} year={fy.year} /> : null}
          {report === 'plans' ? (
            <>
              <TpReport month={month} year={fy.year} />
              <DailyPlanReport month={month} year={fy.year} />
            </>
          ) : null}
          {report === 'more' ? (
            <View style={styles.more}>
              {MORE.map((m) => (
                <RowCard key={m.title} icon={m.icon} accent="blue" title={m.title} subtitle={m.about} right={<ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText>} onPress={() => router.push(m.href)} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  more: { gap: Spacing.two },
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: WideContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
  },
});
