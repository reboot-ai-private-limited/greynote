import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getTeamDoctor, giftLine, serviceStageText, type TeamDoctorDetail } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyDay } from '@/offline/day';

const TYPE: Record<string, string> = { TOUR_PACKAGE: 'Tour package', GIFT: 'Gift', ONLINE_PROMOTION: 'Online promotion', OTHERS: 'Others' };

/**
 * One doctor of your team (manager and the MR above): who holds him, how he is visited this month and every service asked for him with its amount and
 * stage (docs/mobile/team.md). Read only. A doctor held by someone outside your team is not found.
 */
export default function TeamDoctorScreen() {
  const { id, month: monthParam } = useLocalSearchParams<{ id: string; month?: string }>();
  const online = useOnline();
  const fy = useFinancialYear();
  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(typeof monthParam === 'string' ? monthParam : null);
  const month = clamp(picked ?? lastMonth);
  const q = useCachedFetch<TeamDoctorDetail>(`team-doctor:${fy.year}:${id}:${month}`, () => getTeamDoctor(String(id), month));
  const d = q.data;
  return (
    <ScreenShell title={d?.doctor.name ?? 'Doctor'} subtitle={d ? [d.doctor.specialty, d.doctor.clinicName].filter(Boolean).join(' · ') : undefined} onRefresh={q.reload} refreshing={q.refreshing}>
      {!online && !d ? <Notice tone="info">Connect to see this doctor.</Notice> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && !d ? <Skeleton cards={3} lines={3} /> : null}
      {d ? (
        <>
          <InfoCard>
            <ThemedText type="smallBold">{`Held by ${d.heldBy.name} (${d.heldBy.employeeCode})`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{[d.doctor.routeName, d.doctor.address].filter(Boolean).join(' · ')}</ThemedText>
            {d.doctor.phone ? <PrimaryButton label={d.doctor.phone} variant="text" onPress={() => void Linking.openURL(`tel:${d.doctor.phone}`)} style={styles.link} /> : null}
          </InfoCard>
          <InfoCard>
            <ThemedText type="smallBold">Month</ThemedText>
            <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
          </InfoCard>
          <SummaryStrip
            items={[
              { label: 'Visits this month', value: d.doctor.visitFrequency ? `${d.visitsThisMonth}/${d.doctor.visitFrequency}` : d.visitsThisMonth, accent: 'blue' },
              { label: 'Services asked', value: d.services.totals.count, accent: 'purple' },
              { label: 'Services ₹', value: formatRupees(d.services.totals.totalPaise), accent: 'green' },
            ]}
          />
          <CardSection icon={sym('gift', 'redeem')} accent="amber" title="Gifts for this doctor" count={d.gifts?.items.length || undefined}>
            <ThemedText type="small" themeColor="textSecondary">{giftLine(d.gifts?.totals).text}</ThemedText>
            {(d.gifts?.items ?? []).map((g) => (
              <InfoCard key={g.id}>
                <View style={styles.head}>
                  <ThemedText type="smallBold" style={styles.grow}>{`${g.productName} · ${formatRupees(g.amountPaise)}`}</ThemedText>
                  <Pill text={g.status === 'DONE' ? 'Given' : 'Not given yet'} accent={g.status === 'DONE' ? 'green' : 'amber'} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">{g.completedAt ? `Given on ${prettyDay(g.completedAt.slice(0, 10))}` : `Set aside on ${prettyDay(g.allocatedAt.slice(0, 10))}`}</ThemedText>
              </InfoCard>
            ))}
          </CardSection>
          <CardSection icon={sym('briefcase', 'work')} accent="purple" title="Services asked for this doctor" count={d.services.items.length || undefined}>
            {d.services.items.length === 0 ? <Notice tone="info">No service has been asked for this doctor.</Notice> : null}
            {d.services.items.map((s) => {
              const stage = serviceStageText(s.status, s.doneAt);
              return (
                <InfoCard key={s.id}>
                  <View style={styles.head}>
                    <ThemedText type="smallBold" style={styles.grow}>{`${TYPE[s.serviceType] ?? s.serviceType} · ${formatRupees(s.amountPaise)}`}</ThemedText>
                    <Pill text={stage.text} accent={stage.accent} />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{`Asked by ${s.askedBy || 'someone'} on ${prettyDay(s.createdAt.slice(0, 10))}${s.remarks ? ` · ${s.remarks}` : ''}`}</ThemedText>
                </InfoCard>
              );
            })}
          </CardSection>
          <CardSection icon={sym('stethoscope', 'medical_services')} accent="teal" title="Recent visits" count={d.calls.length || undefined}>
            {d.calls.length === 0 ? <Notice tone="info">No visits in the last two months.</Notice> : null}
            {d.calls.map((c, i) => (
              <ThemedText key={`${c.at}${i}`} type="small">{`${prettyDay(c.date)}${c.remarks ? ` · ${c.remarks}` : ''}`}</ThemedText>
            ))}
          </CardSection>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  link: { alignSelf: 'flex-start' },
});
