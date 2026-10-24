import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useTheme } from '@/hooks/use-theme';
import { doctorCountText, isFieldDay, routeNamesText, workingTypeLabel } from '@/lib/planning';
import { useCachedSource } from '@/offline/cache';
import { useColleagues } from '@/offline/colleagues';
import { monthOf } from '@/offline/day';
import type { PlanningSnapshot, TerritorySnapshot } from '@/types/sync';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';

const CALENDAR: SymbolViewProps['name'] = { ios: 'calendar', android: 'event', web: 'event' } as SymbolViewProps['name'];

const STATUS_TEXT: Record<string, string> = {
  APPROVED: 'Approved',
  MANAGER_APPROVED: 'Approved', // one approval since 2026-10-23: only older plans have this status
  SUBMITTED: 'Waiting for approval',
  DRAFT: 'Saved, not submitted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

type Badge = { bg: string; fg: string };
const GREEN: Badge = { bg: Accents.green.bg, fg: '#15803D' };
const AMBER: Badge = { bg: Accents.amber.bg, fg: '#B45309' };
const RED: Badge = { bg: Accents.red.bg, fg: '#B91C1C' };
const GREY: Badge = { bg: Accents.slate.bg, fg: '#475569' };

const STATUS_BADGE: Record<string, Badge> = {
  APPROVED: GREEN,
  MANAGER_APPROVED: GREEN,
  SUBMITTED: AMBER,
  REJECTED: RED,
};

function prettyDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const TRIP_TEXT = { STAY: 'Trip stay day', TRANSIT: 'Trip return day' } as const;

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * What today holds: work type, routes, who with, and (once approved) doctors. Until the Daily Plan is approved this is
 * the Tour Plan's day; after, the Daily Plan's. All from the phone's last pull, so it works offline.
 */
function TodayPlanDetails({ today }: { today: string }) {
  const theme = useTheme();
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { colleagues } = useColleagues();

  const daily = planning.data?.dailyPlans.find((p) => p.planDate === today);
  const approved = daily?.status === 'APPROVED' || daily?.status === 'MANAGER_APPROVED';
  const tourDay = planning.data?.monthlyPlans
    .find((m) => m.planMonth === monthOf(today))
    ?.entries.find((e) => e.planDate === today);
  const plan = approved ? daily : tourDay;
  if (!plan) return null;

  const fieldDay = isFieldDay(plan.workingType);
  const trip = plan.dayKind === 'STAY' || plan.dayKind === 'TRANSIT' ? ` · ${TRIP_TEXT[plan.dayKind]}` : '';
  const byId = new Map(colleagues.map((c) => [c.id, c]));
  const people = plan.workWith.map((id) => {
    const c = byId.get(id);
    if (!c) return 'Colleague';
    return c.designation ? `${c.name} (${c.designation})` : c.name;
  });
  const doctors = approved ? daily.doctors : undefined;
  const carried = doctors?.filter((d) => d.carriedFrom !== null).length ?? 0;

  return (
    <Pressable
      onPress={() => router.push('/daily-plan')}
      accessibilityRole="button"
      accessibilityLabel="Open today’s Daily Plan"
      style={({ pressed }) => [styles.details, { borderColor: theme.border }, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.source}>
        {approved ? 'Today’s approved Daily Plan' : 'From your Tour Plan'}
      </ThemedText>
      <Detail label="Work type" value={`${workingTypeLabel(plan.workingType)}${trip}`} />
      {fieldDay && plan.routeIds.length > 0 ? (
        <Detail label="Route" value={routeNamesText(plan.routeIds, territory.data?.routes)} />
      ) : null}
      <Detail label="Work with" value={people.length > 0 ? people.join(', ') : 'Alone'} />
      {fieldDay && doctors ? (
        <Detail
          label="Doctors"
          value={`${doctorCountText(doctors.length)} planned${carried > 0 ? ` · ${carried} carried over` : ''}`}
        />
      ) : null}
      {plan.remarks ? <Detail label="Remarks" value={plan.remarks} /> : null}
    </Pressable>
  );
}

/** Today at a glance: the date, the Tour Plan's status, the submitted plan's details, and the next step if there is one. */
export function TodayCard() {
  const gate = useDayGate();
  const theme = useTheme();
  const blocked = gate.state === 'blocked';

  const plan =
    gate.state === 'unknown'
      ? 'Not loaded yet'
      : blocked
        ? 'Account blocked'
        : gate.planStatus
          ? (STATUS_TEXT[gate.planStatus] ?? gate.planStatus)
          : 'Not submitted';
  const badge = blocked ? RED : gate.planStatus ? (STATUS_BADGE[gate.planStatus] ?? GREY) : GREY;

  // A plan exists (written from the Monthly Plan) but still needs the doctors picked and a submit. With no plan there is nothing to open.
  const needsPlan = gate.state === 'closed' && gate.planStatus !== null && gate.planStatus !== 'SUBMITTED';
  // Sent (waiting or approved): the plan can still be opened to see it.
  const sent = !blocked && (gate.planStatus === 'SUBMITTED' || gate.planStatus === 'APPROVED' || gate.planStatus === 'MANAGER_APPROVED');
  // The Tour Plan not being approved comes first: until it is, there is no Daily Plan to submit.
  const planButton = gate.cause === 'MONTHLY_PLAN' ? null : needsPlan ? 'submit' : sent ? 'view' : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: blocked ? theme.danger : theme.border }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: Accents.green.bg }]}>
          <SymbolView name={CALENDAR} size={22} tintColor={Accents.green.solid} />
        </View>
        <View style={styles.text}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
            {prettyDate(gate.today)}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.title}>
            Today’s Tour Plan
          </ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <ThemedText type="smallBold" style={[styles.badgeText, { color: badge.fg }]} numberOfLines={2}>
            {plan}
          </ThemedText>
        </View>
      </View>
      {blocked ? null : <TodayPlanDetails today={gate.today} />}
      {/* The badge already says where the Daily Plan stands, so its button needs no note above it. */}
      {planButton ? null : (
        <ThemedText type="small" themeColor={blocked ? 'danger' : 'textSecondary'} style={styles.note}>
          {gate.reason ?? 'You can log calls and expenses for today.'}
        </ThemedText>
      )}
      {gate.cause === 'MONTHLY_PLAN' ? (
        <PrimaryButton
          label="Go to Tour Plan"
          onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })}
        />
      ) : planButton === 'submit' ? (
        <PrimaryButton label="Submit Plan" onPress={() => router.push('/daily-plan')} />
      ) : planButton === 'view' ? (
        <PrimaryButton label="View Daily Plan" variant="text" onPress={() => router.push('/daily-plan')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  date: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 16, lineHeight: 22 },
  badge: { maxWidth: 128, borderRadius: 999, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two + 2 },
  badgeText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  note: { fontSize: 13, lineHeight: 18 },
  details: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: Spacing.two, gap: Spacing.one },
  pressed: { opacity: 0.6 },
  source: { fontSize: 12, lineHeight: 16 },
  detail: { flexDirection: 'row', gap: Spacing.two },
  detailLabel: { width: 84, fontSize: 13, lineHeight: 18 },
  detailValue: { flex: 1, fontSize: 13, lineHeight: 18 },
});
