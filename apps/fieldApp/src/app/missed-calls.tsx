import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getDoctorVisits, type DoctorVisitMr, type DoctorVisitRow, type DoctorVisitsReport } from '@/lib/doctor-visits';
import { useFinancialYear } from '@/lib/financial-year';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen, monthOf, prettyMonth } from '@/offline/day';

const visitsText = (made: number, missed: number) => (missed === 0 ? `${made} called · done` : `${made} called, ${missed} missed`);

function DoctorRows({ rows }: { rows: DoctorVisitRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <ThemedView key={r.doctor.id} type="backgroundElement" style={styles.card}>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.grow}>
              {r.doctor.name}
            </ThemedText>
            <ThemedText type="smallBold" themeColor={r.missed === 0 ? 'primary' : 'danger'}>
              {visitsText(r.made, r.missed)}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">{`${r.doctor.specialty} · ${r.frequency} visit${r.frequency === 1 ? '' : 's'} a month`}</ThemedText>
        </ThemedView>
      ))}
    </>
  );
}

/** One team member: their totals, and their doctors when opened. */
function TeamMember({ item }: { item: DoctorVisitMr }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.grow}>{`${item.mr.name} · ${item.mr.employeeCode}`}</ThemedText>
            <ThemedText type="small">{open ? '▴' : '▾'}</ThemedText>
          </View>
          <ThemedText type="small" themeColor={item.missed === 0 ? 'primary' : 'danger'}>{`${visitsText(item.made, item.missed)} · ${item.completedDoctors} of ${item.doctors} doctors done`}</ThemedText>
        </ThemedView>
      </Pressable>
      {open ? <DoctorRows rows={item.rows} /> : null}
    </View>
  );
}

/**
 * Missed Calls: each doctor with a visit target (set when adding a doctor, or by your manager or Admin), against the
 * calls you made in the month — "1 called, 3 missed" until the target is reached. A manager sees their team's totals too.
 * Only calls on submitted or approved daily reports count, so today's calls show after Final Submission. The last copy
 * can be read offline.
 */
export default function MissedCallsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();

  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);

  const report = useCachedFetch<DoctorVisitsReport>(`doctor-visits:${fy.year}:${month}`, () => getDoctorVisits(month));
  const data = report.data;
  const mine = data?.mrs.find((m) => m.mr.id === me?.id) ?? null;
  const team = (data?.mrs ?? []).filter((m) => m.mr.id !== me?.id);

  return (
    <ScreenShell title="Missed Calls" onRefresh={report.reload} refreshing={report.refreshing}>
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />

      {!online && !data ? <Notice tone="info">Connect once to load your visits for this month.</Notice> : null}
      {report.stale && report.fetchedAt && data && (!online || report.error) ? <Notice tone="info">{`Showing the copy from ${formatWhen(report.fetchedAt)}.`}</Notice> : null}
      {report.error && online ? <Notice tone="danger">{report.error}</Notice> : null}
      {!data && online && !report.error ? (
        <View style={styles.stack}>
          <Skeleton cards={1} lines={3} />
          <Skeleton cards={3} lines={2} />
        </View>
      ) : null}

      {data ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">{`${prettyMonth(data.month)} · visits against your targets`}</ThemedText>
            <ThemedText type="subtitle">{`${data.totals.made} of ${data.totals.quota} visits`}</ThemedText>
            <ThemedText type="small" themeColor={data.totals.missed === 0 ? 'primary' : 'danger'}>{`${visitsText(data.totals.made, data.totals.missed)} · ${data.totals.completedDoctors} of ${data.totals.doctors} doctors done`}</ThemedText>
          </ThemedView>

          {data.mrs.length === 0 ? (
            <Notice tone="info">{'No doctor has a visit target yet. Set “Visits a month” when you add a doctor, or ask your manager or Admin to set it.'}</Notice>
          ) : null}

          {mine ? <DoctorRows rows={mine.rows} /> : null}

          {team.length > 0 ? (
            <>
              <ThemedText type="smallBold">Your team</ThemedText>
              {team.map((m) => (
                <TeamMember key={m.mr.id} item={m} />
              ))}
            </>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary">
            Only calls on submitted or approved daily reports count, so today’s calls show once you submit the day.
          </ThemedText>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
