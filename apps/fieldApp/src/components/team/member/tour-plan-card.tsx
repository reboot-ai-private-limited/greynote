import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { getTeamMemberTourPlan } from '@/lib/planning';
import { tourPlanChip } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay, prettyMonth } from '@/offline/day';

import { Notice } from '../../notice';
import { PrimaryButton } from '../../primary-button';
import { Skeleton } from '../../skeleton';
import { ThemedText } from '../../themed-text';
import { InfoCard, Pill } from '../../ui-cards';
import { MemberDownloads } from '../member-downloads';

type Props = { userId: string; month: string; name: string; employeeCode: string; designation: string | null };

/**
 * The person's Tour Plan for the month: its status, then every day (work type, **route names**, remarks, trips), read live whatever its state, with the CSV
 * download inside the card. No Tour Plan: the card says so and the download is off with that reason, so nobody taps and is told "not available".
 */
export function TourPlanCard({ userId, month, name, employeeCode, designation }: Props) {
  const online = useOnline();
  const fy = useFinancialYear();
  const q = useCachedFetch(`team-member-tourplan:${fy.year}:${userId}:${month}`, () => getTeamMemberTourPlan(userId, month));
  const [open, setOpen] = useState(false);
  const plan = q.data;
  const none = q.data === null;
  const chip = tourPlanChip(plan?.status);
  const routeName = new Map((plan?.routes ?? []).map((r) => [r.id, r.name]));
  return (
    <InfoCard>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>{`Tour Plan · ${prettyMonth(month)}`}</ThemedText>
        <Pill text={chip.text} accent={chip.accent} />
      </View>
      {!online && q.data === undefined ? <Notice tone="info">Connect to see the Tour Plan.</Notice> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && q.data === undefined ? <Skeleton cards={1} lines={2} /> : null}
      {none ? <ThemedText type="small" themeColor="textSecondary">{`${name} has no Tour Plan for ${prettyMonth(month)}.`}</ThemedText> : null}
      {plan ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {plan.status === 'APPROVED' || plan.status === 'MANAGER_APPROVED' ? `${plan.entries.length} days planned. The Daily Plans below start from these and may be changed day by day.` : 'Not approved yet: these are the days the person saved or sent.'}
          </ThemedText>
          <PrimaryButton label={open ? 'Hide the days ▴' : `Show the days (${plan.entries.length}) ▾`} variant="text" onPress={() => setOpen((o) => !o)} style={styles.link} />
          {open
            ? plan.entries.map((e) => (
                <View key={e.planDate} style={styles.day}>
                  <ThemedText type="smallBold">{prettyDay(e.planDate)}</ThemedText>
                  <ThemedText type="small">
                    {e.workingType === 'FIELD_WORK' || e.workingType === 'DOCTOR_CAMPAIGN' ? (e.routeIds.length > 0 ? e.routeIds.map((id) => routeName.get(id) ?? 'Route').join(', ') : 'No route') : e.workingType.replace(/_/g, ' ').toLowerCase()}
                    {e.dayKind === 'STAY' ? ' · stay (trip)' : e.dayKind === 'TRANSIT' ? ' · return (trip)' : e.returnDate ? ` · trip until ${prettyDay(e.returnDate)}` : ''}
                    {e.remarks ? ` · “${e.remarks}”` : ''}
                  </ThemedText>
                </View>
              ))
            : null}
        </>
      ) : null}
      <MemberDownloads userId={userId} employeeCode={employeeCode} name={name} designation={designation} month={month} only="plan" disabledReason={none ? `No Tour Plan for ${prettyMonth(month)}` : null} />
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  link: { alignSelf: 'flex-start' },
  day: { gap: 2, paddingVertical: Spacing.one },
});
