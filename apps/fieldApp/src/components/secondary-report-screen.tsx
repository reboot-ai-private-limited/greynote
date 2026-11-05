import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getSecondaryReport, type SecondaryReport, type SecondaryReportLine } from '@/lib/stock-counts';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf } from '@/offline/day';

const money = (paise: number | null) => (paise === null ? '—' : formatRupees(paise));

/** One product row; tapping it shows the MRs behind the figures. */
function ProductRow({ line }: { line: SecondaryReportLine }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${line.product.name}, show MRs`} onPress={() => setOpen((v) => !v)} style={styles.stack}>
        <View style={styles.between}>
          <ThemedText type="smallBold" style={styles.grow}>{line.product.name}</ThemedText>
          <ThemedText type="small">{money(line.issuedAmountPaise)}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {`Opening ${line.openingQty} · Primary ${line.primaryQty} · Secondary ${line.issuedQty} · Closing ${line.closingQty}`}
        </ThemedText>
      </Pressable>
      {open
        ? line.byMr.map((m) => (
            <View key={m.userId} style={[styles.mr, { borderLeftColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="primary">{m.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`Opening ${m.openingQty} · Primary ${m.primaryQty} · Secondary ${m.issuedQty} · Closing ${m.closingQty}`}
              </ThemedText>
            </View>
          ))
        : null}
    </View>
  );
}

/**
 * Secondary Sales for a manager (docs/mobile/secondary-and-targets.md, 2026-11-05): no entry controls. The approved rows of the MRs
 * in their downline, summed by distributor then product at PTS, so each product is counted once. Approving or rejecting an MR's
 * month stays on the Approvals screen.
 */
export function SecondaryReportScreen() {
  const online = useOnline();
  const theme = useTheme();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked && picked >= fy.firstMonth && picked <= lastMonth ? picked : lastMonth;
  const report = useCachedFetch<SecondaryReport>(`secondary-report:${fy.year}:${month}`, () => getSecondaryReport(month));
  const data = report.data?.month === month ? report.data : null;

  return (
    <ScreenShell title="Secondary Sales" subtitle="Your team’s approved secondary" onRefresh={report.reload} refreshing={report.refreshing}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      {!online ? <Notice tone="info">You’re offline. Connect to see your team’s secondary.</Notice> : null}
      {report.error && online ? <Notice tone="danger">{report.error}</Notice> : null}
      {report.loading && !data ? <Skeleton cards={3} lines={2} /> : null}
      {data ? (
        <>
          <SummaryStrip
            items={[
              { label: 'MRs approved', value: `${data.approvedMrCount} of ${data.mrCount}`, accent: data.approvedMrCount < data.mrCount ? 'amber' : 'green' },
              { label: 'Units', value: data.totals.issuedQty, accent: 'blue' },
              { label: 'Value', value: formatRupees(data.totals.issuedAmountPaise), accent: 'green' },
            ]}
          />
          {data.distributors.length === 0 ? <Notice tone="info">No approved secondary for this month yet.</Notice> : null}
          {data.distributors.map((d) => (
            <InfoCard key={d.distributorId}>
              <View style={styles.between}>
                <ThemedText type="smallBold" style={styles.grow}>{d.name}</ThemedText>
                <ThemedText type="smallBold">{formatRupees(d.totals.issuedAmountPaise)}</ThemedText>
              </View>
              {d.lines
                .filter((l) => l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0)
                .map((l) => (
                  <ProductRow key={l.product.id} line={l} />
                ))}
              <View style={[styles.total, { backgroundColor: theme.backgroundSelected, borderColor: theme.primary }]}>
                <View style={styles.between}>
                  <ThemedText type="smallBold" themeColor="primary" style={styles.grow}>Total</ThemedText>
                  <ThemedText type="smallBold" themeColor="primary">{formatRupees(d.totals.issuedAmountPaise)}</ThemedText>
                </View>
                <ThemedText type="smallBold">
                  {`Opening ${d.totals.openingQty} · Primary ${d.totals.primaryQty} · Secondary ${d.totals.issuedQty} · Closing ${d.totals.closingQty}`}
                </ThemedText>
              </View>
            </InfoCard>
          ))}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.one },
  grow: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mr: { marginLeft: Spacing.two, paddingLeft: Spacing.two, borderLeftWidth: 3, gap: 2 },
  total: { padding: Spacing.three, borderRadius: Spacing.two, borderWidth: 1, gap: Spacing.one },
});
