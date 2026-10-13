import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { MonthReport } from '@/components/month-report';
import { DcrReport, SalesReport, TaDaReport, TpReport } from '@/components/reports';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, WideContentWidth } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { monthOf } from '@/offline/day';

type Report = 'month' | 'dcr' | 'tada' | 'tp' | 'sales';
const REPORTS: { value: Report; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'dcr', label: 'DCR' },
  { value: 'tada', label: 'TA / DA' },
  { value: 'tp', label: 'Tour Plan' },
  { value: 'sales', label: 'Gift & Sales' },
];

/**
 * Reports (PRD §6.3): your past work and where it stands, a month at a time. Follows the financial-year switch
 * (Home → Utility → Financial Year): pick a past year and the months and figures are that year's, read-only.
 */
export default function ReportsScreen() {
  const fy = useFinancialYear();
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
          <FyBanner />
          <ChoiceChips options={REPORTS} value={report} onChange={setReport} />
          <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={fy.lastMonth} />
          {report === 'month' ? <MonthReport month={month} year={fy.year} /> : null}
          {report === 'dcr' ? <DcrReport month={month} year={fy.year} /> : null}
          {report === 'tada' ? <TaDaReport month={month} year={fy.year} /> : null}
          {report === 'tp' ? <TpReport month={month} year={fy.year} /> : null}
          {report === 'sales' ? <SalesReport month={month} year={fy.year} /> : null}
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
});
