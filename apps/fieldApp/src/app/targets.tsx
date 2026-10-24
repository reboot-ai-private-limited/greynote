import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Meter, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getEmployeeSalesReport } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';
import { useTeam } from '@/offline/team';

const percentText = (p: number | null) => (p === null ? 'no target' : `${p}%`);
const accentFor = (p: number | null): Accent => (p === null ? 'slate' : p >= 100 ? 'green' : p >= 50 ? 'amber' : 'red');

/**
 * Targets (docs/mobile/secondary-and-targets.md): what you are meant to sell in a month, per product, as an amount or as units,
 * against your achievement: counted from the stock of the distributors handed to you, valued at PTS (not from what you enter on
 * Secondary Sales). Primary is shown beside it. The figures are your own; a manager's are the total of their MRs.
 * Only Admin sets targets (on the web portal), so this screen is view-only for everyone.
 * Needs a connection: the figures are worked out live.
 */
export default function TargetsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();
  const { isManager } = useCurrentUser();
  const { team } = useTeam();

  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? (fy.isPast ? fy.lastMonth : monthOf(fy.today)));
  const report = useCachedFetch(`emp-report:${fy.year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month));
  const figures = report.data;

  // A manager has no target of their own (theirs is the total of their MRs); this is each MR's share of the month.
  const mrs = team.filter((c) => c.designation === null || c.designation === 'MR');
  const perMr = useCachedFetch(
    `emp-report-mrs:${fy.year}:${month}`,
    async () => {
      const rows = await Promise.all(
        mrs.slice(0, 30).map(async (m) => {
          try {
            return { member: m, report: await getEmployeeSalesReport(m.id, month, month) };
          } catch {
            return { member: m, report: null };
          }
        }),
      );
      return rows;
    },
    `${mrs.length}:${isManager}`,
  );

  // Products worth a row: one with a target or a secondary entered (primary alone is shown in the totals).
  const rows = (figures?.products ?? []).filter((p) => p.targetPaise > 0 || p.secondaryQty > 0 || p.primaryQty !== 0);

  return (
    <ScreenShell title="Targets" subtitle="Your targets against what your distributors sold">
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      </InfoCard>

      {!online ? <Notice tone="warning">Targets are worked out on the server. Connect to see them.</Notice> : null}
      {report.error && online ? <Notice tone="danger">{report.error}</Notice> : null}
      {report.loading && !figures ? <Notice tone="info">Loading…</Notice> : null}

      {figures ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Target', value: formatRupees(figures.totals.targetPaise), accent: 'blue' },
              { label: 'Achieved', value: formatRupees(figures.totals.secondaryPaise), accent: 'green' },
              { label: 'Achievement', value: figures.totals.achievementPercent === null ? '—' : `${figures.totals.achievementPercent}%`, accent: accentFor(figures.totals.achievementPercent) },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {`Achieved is counted from your distributors' stock, at PTS. It shows 0 until their stock is counted. Primary this month: ${formatRupees(figures.totals.primaryPaise)}.${figures.generalTargetPaise > 0 ? ` Includes ${formatRupees(figures.generalTargetPaise)} for all products.` : ''}`}
          </ThemedText>
          {figures.team ? (
            figures.team.mrCount === 0 ? (
              <Notice tone="info">No MRs under you, so there is nothing to total yet.</Notice>
            ) : (
              <Notice tone="info">{`These figures are the total of the ${figures.team.mrCount} MR${figures.team.mrCount === 1 ? '' : 's'} in your team. Admin sets each MR’s targets.`}</Notice>
            )
          ) : null}
          {figures.totals.targetPaise === 0 && !(figures.team && figures.team.mrCount === 0) ? <Notice tone="info">No target is set for this month. Targets are set by Admin.</Notice> : null}

          {figures.targets.map((t) => (
            <InfoCard key={t.id}>
              <View style={styles.head}>
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{t.product?.name ?? 'All products'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t.fromMonth === t.toMonth ? prettyMonth(t.fromMonth) : `${prettyMonth(t.fromMonth)} to ${prettyMonth(t.toMonth)}`}
                  </ThemedText>
                </View>
                <Pill text={percentText(t.achievementPercent)} accent={accentFor(t.achievementPercent)} />
              </View>
              <Meter value={t.achievedPaise} total={t.amountPaise} accent={accentFor(t.achievementPercent)} />
              <ThemedText type="small">{`${formatRupees(t.achievedPaise)} of ${formatRupees(t.amountPaise)}`}</ThemedText>
              {t.targetQty !== null ? (
                <>
                  <Meter value={t.achievedQty} total={t.targetQty} accent={accentFor(t.achievementQtyPercent)} />
                  <ThemedText type="small">{`${t.achievedQty} of ${t.targetQty} units · ${percentText(t.achievementQtyPercent)}`}</ThemedText>
                </>
              ) : null}
            </InfoCard>
          ))}

          {figures.team && figures.team.mrCount > 0 && perMr.data && perMr.data.length > 0 ? (
            <>
              <ThemedText type="smallBold">By MR</ThemedText>
              {perMr.data.map(({ member, report: r }) => (
                <InfoCard key={member.id}>
                  <View style={styles.head}>
                    <ThemedText type="smallBold" style={styles.grow}>{`${member.name} · ${member.employeeCode}`}</ThemedText>
                    {r ? <Pill text={percentText(r.totals.achievementPercent)} accent={accentFor(r.totals.achievementPercent)} /> : null}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {r ? `Target ${formatRupees(r.totals.targetPaise)} · Achieved ${formatRupees(r.totals.secondaryPaise)}` : 'Couldn’t load this MR’s figures.'}
                  </ThemedText>
                </InfoCard>
              ))}
            </>
          ) : null}

          {rows.length > 0 ? <ThemedText type="smallBold">By product</ThemedText> : null}
          {rows.map((p) => (
            <InfoCard key={p.product.id}>
              <ThemedText type="smallBold">{p.product.name}</ThemedText>
              <ThemedText type="small">{`Target ${formatRupees(p.targetPaise)} · Achieved ${p.secondaryQty} units, ${formatRupees(p.secondaryPaise)} · ${percentText(p.achievementPercent)}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`Primary ${p.primaryQty} units, ${formatRupees(p.primaryPaise)}`}</ThemedText>
              {p.flags.includes('NO_PTS') ? <ThemedText type="small" themeColor="warning">This product has no PTS price, so its achievement is counted in units only.</ThemedText> : null}
            </InfoCard>
          ))}
          {figures.distributors && figures.distributors.length > 0 ? <ThemedText type="smallBold">Primary by distributor</ThemedText> : null}
          {(figures.distributors ?? []).map((d) => (
            <InfoCard key={d.distributor.id}>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.grow}>{d.distributor.name}</ThemedText>
                <ThemedText type="smallBold">{formatRupees(d.orderPaise)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{`${d.orderQty} unit${d.orderQty === 1 ? '' : 's'} on Done orders`}</ThemedText>
            </InfoCard>
          ))}
          <PrimaryButton label="Enter secondary sales" variant="text" onPress={() => router.push('/secondary-sales')} />
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
});
