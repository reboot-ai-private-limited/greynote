import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { NumberedRow } from '@/components/numbered-row';
import { PillToggle } from '@/components/pill-toggle';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { SelectField } from '@/components/select-field';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Meter, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getMemberDoctors, getTeamMemberSummary, matchesDoctorFilter, type DoctorFilter, type MemberDoctors, type TeamMemberSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyDay, prettyMonth } from '@/offline/day';

const FILTERS: { value: DoctorFilter; label: string }[] = [
  { value: 'ALL', label: 'All doctors with a target' },
  { value: 'NO_CALL', label: 'No call this month' },
  { value: 'BEHIND', label: 'Behind target' },
  { value: 'CARRIED', label: 'Carried over' },
];

/**
 * Doctors this month for one person (opened from the Overview card): **Total**, the month in numbers (doctor and chemist calls, visits wanted, made and missed or
 * remaining, not called at all, carried over), and **Doctor-wise**, each doctor's visits against target. Read-only; the doctor page and the Doctors tab have the rest.
 */
export default function TeamDoctorMetricsScreen() {
  const { id, month: monthParam } = useLocalSearchParams<{ id: string; month?: string }>();
  const userId = String(id);
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const [picked, setMonth] = useState<string | null>(typeof monthParam === 'string' && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null);
  const month = (() => {
    const m = picked ?? lastMonth;
    return m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m;
  })();
  const [view, setView] = useState<'TOTAL' | 'DOCTORS'>('TOTAL');
  const [filter, setFilter] = useState<DoctorFilter>('ALL');
  const running = month >= monthOf(fy.today);

  const doctors = useCachedFetch<MemberDoctors>(`team-member-doctors:${fy.year}:${userId}:${month}`, () => getMemberDoctors(userId, month));
  const summary = useCachedFetch<TeamMemberSummary>(`team-member:${userId}:${month}`, () => getTeamMemberSummary(userId, month));
  const t = doctors.data?.totals;
  const items = doctors.data?.items ?? [];
  const field = summary.data?.overview?.field;
  const carried = items.filter((d) => d.carriedSince);
  const rows = (filter === 'CARRIED' ? items : items.filter((d) => !!d.visitFrequency))
    .filter((d) => matchesDoctorFilter(d, filter))
    .sort((a, b) => (b.visitFrequency ? b.visitFrequency - Math.min(b.visitsThisMonth, b.visitFrequency) : 0) - (a.visitFrequency ? a.visitFrequency - Math.min(a.visitsThisMonth, a.visitFrequency) : 0) || a.name.localeCompare(b.name));
  const left = t ? t.quota - t.made : 0;

  return (
    <ScreenShell title="Doctors this month" subtitle={summary.data?.member.name ?? ''} onRefresh={() => { doctors.reload(); summary.reload(); }} refreshing={doctors.refreshing}>
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      <PillToggle options={[{ value: 'TOTAL', label: 'Total' }, { value: 'DOCTORS', label: 'Doctor-wise' }]} value={view} onChange={setView} />
      {!online && !doctors.data ? <Notice tone="info">Connect to see this month’s numbers.</Notice> : null}
      {doctors.error && online ? <Notice tone="danger">{doctors.error}</Notice> : null}
      {doctors.loading && !doctors.data ? <Skeleton cards={2} lines={3} /> : null}

      {t && view === 'TOTAL' ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Doctor calls', value: field?.doctorCalls ?? '–', accent: 'blue' },
              { label: 'Chemist calls', value: field?.chemistCalls ?? '–', accent: 'green' },
              { label: 'Follow-ups', value: field?.followups ?? '–', accent: 'purple' },
            ]}
          />
          <InfoCard>
            <ThemedText type="smallBold">{`${prettyMonth(month)} · visits against targets`}</ThemedText>
            <ThemedText type="small">{t.quota === 0 ? 'No doctor has a visit target yet.' : `${t.made} of ${t.quota} visits made · ${left} ${running ? 'remaining' : 'missed'}`}</ThemedText>
            {t.quota > 0 ? <Meter value={t.made} total={t.quota} accent={left === 0 ? 'green' : 'amber'} /> : null}
          </InfoCard>
          <SummaryStrip
            items={[
              { label: 'Doctors with a target', value: t.withTarget, accent: 'slate' },
              { label: 'Visits wanted', value: t.quota, accent: 'blue' },
              { label: 'Made', value: t.made, accent: 'green' },
            ]}
          />
          <SummaryStrip
            items={[
              { label: running ? 'Remaining' : 'Missed', value: left, accent: left > 0 ? 'amber' : 'slate' },
              { label: 'Not called at all', value: t.notCalled, accent: t.notCalled > 0 ? 'red' : 'slate' },
              { label: running ? 'Carried over' : 'Carried at month end', value: t.carried, accent: t.carried > 0 ? 'amber' : 'slate' },
            ]}
          />
          {carried.length > 0 ? (
            <InfoCard>
              <ThemedText type="smallBold">{`Carried over (${carried.length})`}</ThemedText>
              {carried.map((d) => (
                <ThemedText key={d.id} type="small">{`${d.name} · planned ${prettyDay(d.carriedSince!)}, not called since`}</ThemedText>
              ))}
            </InfoCard>
          ) : null}
          <PrimaryButton label="Doctor-wise →" variant="text" onPress={() => setView('DOCTORS')} style={styles.link} />
        </>
      ) : null}

      {t && view === 'DOCTORS' ? (
        <>
          <SelectField label="Show" options={FILTERS} value={filter} onChange={setFilter} />
          <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length} doctors`}</ThemedText>
          {rows.length === 0 ? <Notice tone="info">No doctor matches.</Notice> : null}
          {rows.map((d, i) => {
            const wanted = d.visitFrequency ?? 0;
            const made = Math.min(d.visitsThisMonth, wanted);
            const rest = wanted - made;
            return (
              <NumberedRow key={d.id} n={i + 1}>
                <InfoCard>
                  <View style={styles.head}>
                    <PrimaryButton label={d.name} variant="text" onPress={() => router.push({ pathname: '/team-doctor', params: { id: d.id, month } })} style={styles.grow} />
                    {wanted > 0 ? <Pill text={d.visitsThisMonth === 0 ? 'Not called' : rest === 0 ? 'Done' : `${rest} ${running ? 'to go' : 'missed'}`} accent={d.visitsThisMonth === 0 ? 'red' : rest === 0 ? 'green' : 'amber'} /> : null}
                  </View>
                  <ThemedText type="small">{wanted > 0 ? `Visited ${d.visitsThisMonth} of ${wanted} · last visit ${d.lastVisit ? prettyDay(d.lastVisit) : 'not recently'}` : `Visited ${d.visitsThisMonth} · no visit target`}</ThemedText>
                  {d.carriedSince ? <ThemedText type="small" themeColor="warning">{`Carried over: planned ${prettyDay(d.carriedSince)}, not called since`}</ThemedText> : null}
                </InfoCard>
              </NumberedRow>
            );
          })}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, alignSelf: 'flex-start' },
  link: { alignSelf: 'flex-start' },
});
