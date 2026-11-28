import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { DownloadMenu } from '@/components/download-menu';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { DcrReport, ExpensesReport, PlansReport } from '@/components/reports';
import { SelectField } from '@/components/select-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { InfoCard, RowCard, sym } from '@/components/ui-cards';
import { BottomTabInset, Spacing, WideContentWidth } from '@/constants/theme';
import { selectFinancialYear, useFinancialYear } from '@/lib/financial-year';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { useSessionUser } from '@/lib/session';
import { downloadMonthlyWorkReport } from '@/lib/work-reports';
import { monthOf, prettyMonth } from '@/offline/day';

type Tab = 'dcr' | 'plans' | 'expenses' | 'more';
const TABS: { value: Tab; label: string }[] = [
  { value: 'dcr', label: 'DCR' },
  { value: 'plans', label: 'Plans' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'more', label: 'More' },
];

/** Reports → More: each opens its own view-only report for the month, with its Excel. */
const MORE: { kind: string; title: string; about: string; icon: ReturnType<typeof sym> }[] = [
  { kind: 'orders', title: 'Orders', about: 'Outlet, items, value, status', icon: sym('cart', 'shopping_cart') },
  { kind: 'leave', title: 'Leave', about: 'Dates, type, days, status', icon: sym('calendar.badge.clock', 'event_busy') },
  { kind: 'gifts', title: 'Gifts', about: 'Doctor, gift, value, status', icon: sym('gift', 'redeem') },
  { kind: 'services', title: 'Doctor services', about: 'Doctor, service, amount, status', icon: sym('briefcase', 'work') },
  { kind: 'samples', title: 'Sample & LBL requests', about: 'Products asked for, status', icon: sym('shippingbox', 'inventory_2') },
  { kind: 'visits', title: 'Doctor visits', about: 'Target, made, remaining per doctor', icon: sym('phone.arrow.up.right', 'call_made') },
  { kind: 'targets', title: 'Targets', about: 'Target, achieved, achievement %', icon: sym('target', 'track_changes') },
  { kind: 'secondary', title: 'Secondary sales', about: 'Units and value by distributor', icon: sym('chart.bar', 'bar_chart') },
];

/**
 * Reports (PRD §6.3, reworked 2026-11-28): your own work, a month at a time, view only. The financial year is a dropdown beside the
 * title (a past year is read-only); DCR, Plans and Expenses are short lists with an Excel each; More opens one report per kind of
 * record, and holds the two detailed server sheets (Monthly work, Secondary sales).
 */
export default function ReportsScreen() {
  const fy = useFinancialYear();
  const me = useSessionUser();
  const [tab, setTab] = useState<Tab>('dcr');
  const [picked, setPicked] = useState<string | null>(null);

  const start = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const month = clamp(picked ?? start);
  const person = me ? { id: me.id, name: me.name } : null;
  const fyLabel = fy.label.replace(/^FY /, '');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            <ThemedText type="subtitle" style={styles.title}>Reports</ThemedText>
            <View style={styles.year}>
              <SelectField
                label="Financial year"
                options={fy.options.map((o) => ({ value: String(o.year), label: o.year === fy.current ? `${o.label} · current` : o.label }))}
                value={String(fy.year)}
                onChange={(y) => {
                  if (!me) return;
                  setPicked(null);
                  selectFinancialYear(Number(y) === fy.current ? null : Number(y), me.id);
                }}
              />
            </View>
          </View>
          <FyBanner />
          <InfoCard>
            <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={fy.lastMonth} />
          </InfoCard>
          <ChoiceChips options={TABS} value={tab} onChange={setTab} />

          {tab === 'dcr' ? <DcrReport month={month} year={fy.year} /> : null}
          {tab === 'plans' ? <PlansReport month={month} year={fy.year} /> : null}
          {tab === 'expenses' ? <ExpensesReport month={month} year={fy.year} /> : null}
          {tab === 'more' ? (
            <>
              <ThemedText type="smallBold">{`Your records · ${prettyMonth(month)}`}</ThemedText>
              <View style={styles.list}>
                {MORE.map((m) => (
                  <RowCard
                    key={m.kind}
                    icon={m.icon}
                    accent="blue"
                    title={m.title}
                    subtitle={m.about}
                    right={<ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText>}
                    onPress={() => router.push({ pathname: '/report/[kind]', params: { kind: m.kind, month } } as unknown as Href)}
                  />
                ))}
              </View>
              {person ? (
                <>
                  <ThemedText type="smallBold">Detailed downloads</ThemedText>
                  <DownloadMenu
                    items={[
                      {
                        key: 'monthly-work',
                        label: `Monthly work report (Excel) · ${prettyMonth(month)}`,
                        hint: 'Every day: plan, DCR, doctors, calls, orders, TA / DA / other, leave',
                        build: async () => ({ delivered: await downloadMonthlyWorkReport(person, month, prettyMonth(month)) }),
                      },
                      {
                        key: 'secondary',
                        label: `Secondary sales (Excel) · ${fyLabel}`,
                        hint: 'Your targets and approved secondary by product and month',
                        build: async () => ({ delivered: await downloadSecondarySheet(person, fy.year, fyLabel) }),
                      },
                    ]}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, zIndex: 2 },
  title: { flex: 1 },
  year: { width: 190 },
  list: { gap: Spacing.two },
});
