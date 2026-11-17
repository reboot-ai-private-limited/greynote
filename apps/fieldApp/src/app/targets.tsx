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
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getEmployeeSalesReport } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { TargetsTree } from '@/components/team/targets-tree';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';

const REPORT_STATUS: Record<'NOT_SUBMITTED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED', { text: string; accent: Accent }> = {
  NOT_SUBMITTED: { text: 'Not sent', accent: 'slate' },
  DRAFT: { text: 'Not sent', accent: 'slate' },
  PENDING: { text: 'Waiting for your manager', accent: 'amber' },
  APPROVED: { text: 'Approved', accent: 'green' },
  REJECTED: { text: 'Rejected', accent: 'red' },
};
const percentText = (p: number | null) => (p === null ? 'no target' : `${p}%`);
const accentFor = (p: number | null): Accent => (p === null ? 'slate' : p >= 100 ? 'green' : p >= 50 ? 'amber' : 'red');

/**
 * Targets (docs/mobile/secondary-and-targets.md): what you are meant to sell in a month, against your achievement. Achievement counts ONLY the approved
 * monthly Secondary Sales report (issued units at PTS; primary = the received units of the same report), approved up the chain: an MR's by their manager,
 * a manager's team report (the sum of their approved MRs) by their own manager. Until that approval it reads 0, and a manager sees what is still waiting
 * under it. A manager's target is the total of their MRs; the team is shown as a tree. Only Admin sets targets, so this screen is view-only.
 * Needs a connection: the figures are worked out live.
 */
export default function TargetsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();

  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? (fy.isPast ? fy.lastMonth : monthOf(fy.today)));
  const report = useCachedFetch(`emp-report:${fy.year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month));
  const figures = report.data;

  // Products worth a row: one with a target or a secondary entered (primary alone is shown in the totals).
  const rows = (figures?.products ?? []).filter((p) => p.targetPaise > 0 || p.secondaryQty > 0 || p.primaryQty !== 0);

  return (
    <ScreenShell title="Targets" subtitle="Your targets against your approved secondary sales">
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
            {figures.team
              ? 'Achieved counts only your team report: the approved MR reports below you, once your own manager approves it. Until then it reads 0.'
              : 'Achieved counts only your approved monthly Secondary Sales report (issued units × PTS). It reads 0 until the report is sent and approved by your manager.'}
          </ThemedText>
          {figures.team ? (
            figures.team.mrCount === 0 ? (
              <Notice tone="info">No MRs under you, so there is nothing to total yet.</Notice>
            ) : (
              <>
                <Notice tone="info">{`Target is the total of the ${figures.team.mrCount} MR${figures.team.mrCount === 1 ? '' : 's'} in your team. Admin sets each MR’s targets.`}</Notice>
                <InfoCard>
                  <View style={styles.head}>
                    <ThemedText type="smallBold" style={styles.grow}>Your team report</ThemedText>
                    <Pill text={REPORT_STATUS[figures.team.reportStatus ?? 'NOT_SUBMITTED'].text} accent={REPORT_STATUS[figures.team.reportStatus ?? 'NOT_SUBMITTED'].accent} />
                  </View>
                  <ThemedText type="small">{`Approved MR reports below you: ${formatRupees(figures.team.waitingPaise ?? 0)}${figures.team.approvedMrCount !== undefined ? ` · ${figures.team.approvedMrCount} of ${figures.team.mrCount} MRs approved` : ''}`}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {figures.team.reportStatus === 'APPROVED' ? 'Your manager approved it, so it counts as your achievement.' : 'It becomes your achievement once you send the team report and your own manager approves it.'}
                  </ThemedText>
                </InfoCard>
              </>
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

          {figures.team && figures.team.mrCount > 0 && me ? <TargetsTree rootId={me.id} month={month} /> : null}

          {rows.length > 0 ? <ThemedText type="smallBold">By product</ThemedText> : null}
          {rows.map((p) => (
            <InfoCard key={p.product.id}>
              <ThemedText type="smallBold">{p.product.name}</ThemedText>
              <ThemedText type="small">{`Target ${formatRupees(p.targetPaise)} · Achieved ${p.secondaryQty} units, ${formatRupees(p.secondaryPaise)} · ${percentText(p.achievementPercent)}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`Primary ${p.primaryQty} units, ${formatRupees(p.primaryPaise)}`}</ThemedText>
              {p.flags.includes('NO_PTS') ? <ThemedText type="small" themeColor="warning">This product has no PTS price, so its achievement is counted in units only.</ThemedText> : null}
            </InfoCard>
          ))}
          {figures.distributors && figures.distributors.length > 0 ? <ThemedText type="smallBold">Done orders by distributor (information only, not counted)</ThemedText> : null}
          {(figures.distributors ?? []).map((d) => (
            <InfoCard key={d.distributor.id}>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.grow}>{d.distributor.name}</ThemedText>
                <ThemedText type="smallBold">{formatRupees(d.orderPaise)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{`${d.orderQty} unit${d.orderQty === 1 ? '' : 's'} on Done orders · not part of Achieved`}</ThemedText>
            </InfoCard>
          ))}
          <PrimaryButton label={figures.team ? (figures.team.reportStatus === 'APPROVED' || figures.team.reportStatus === 'PENDING' ? "See the team's Secondary sales" : 'Send the team report') : 'Open Secondary sales'} variant="text" onPress={() => router.push('/secondary-sales')} />
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
});
