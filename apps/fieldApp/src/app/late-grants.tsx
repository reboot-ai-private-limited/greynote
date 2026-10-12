import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateStepper } from '@/components/date-stepper';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  GRANT_STATUS_LABEL,
  grantLateSubmit,
  listLateGrants,
  revokeLateGrant,
  type LateGrant,
  type PlanKind,
} from '@/lib/late-grants';
import { useSessionUser } from '@/lib/session';
import { useColleagues, useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';
import { useTeam } from '@/offline/team';

const KINDS: { value: PlanKind; label: string }[] = [
  { value: 'DAILY_PLAN', label: 'Daily plan' },
  { value: 'MONTHLY_PLAN', label: 'Monthly plan' },
];

/** How long the exception lasts, from the moment it is granted (hours). The server allows up to `LATE_PLAN_GRANT_MAX_HOURS`, 744 by default. */
const DURATIONS = [
  { value: '24', label: '24h' },
  { value: '48', label: '48h' },
  { value: '168', label: '7 days' },
];

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Late submissions (managers): let one of your team submit one plan after its deadline. Pick the person, the plan (a day or a
 * month) and a reason; the exception is good for a limited time and is used up by the submit. An unused one can be revoked.
 * The server only lets a manager do this while Admin has switched that on, and says so when it is off. Needs a connection.
 */
export default function LateGrantsScreen() {
  const theme = useTheme();
  const online = useOnline();
  const me = useSessionUser();
  const { today } = useDayGate();
  const { colleagues } = useColleagues();
  const { team, loaded: teamLoaded } = useTeam();
  const grants = useCachedFetch<{ items: LateGrant[]; total: number }>('late-grants', () => listLateGrants());

  const [durationHours, setDurationHours] = useState('24');

  // The employees a manager may grant to are their own team; every name we know, for the list below.
  const names = useMemo(
    () => new Map([...colleagues.map((c) => [c.id, c.label ?? c.name] as const), ...team.map((t) => [t.id, t.name] as const)]),
    [colleagues, team],
  );

  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [kind, setKind] = useState<PlanKind>('DAILY_PLAN');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);

  const needle = search.trim().toLowerCase();
  const shown = needle ? team.filter((t) => t.name.toLowerCase().includes(needle) || t.employeeCode.toLowerCase().includes(needle)) : team;

  async function grant() {
    if (!userId) return setMsg({ tone: 'warning', text: 'Pick the employee first.' });
    if (!reason.trim()) return setMsg({ tone: 'warning', text: 'Give the reason for the exception.' });
    setBusy(true);
    setMsg(null);
    try {
      const expiresAt = new Date(Date.now() + Number(durationHours) * 3600_000).toISOString();
      await grantLateSubmit({ userId, kind, planKey: kind === 'DAILY_PLAN' ? day : month, reason, expiresAt });
      setReason('');
      setMsg({ tone: 'success', text: `${names.get(userId) ?? 'The employee'} can now submit that plan late.` });
      grants.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await revokeLateGrant(id);
      grants.reload();
      setMsg({ tone: 'success', text: 'The exception was revoked.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const items = grants.data?.items ?? [];

  return (
    <ScreenShell title="Late submissions" onRefresh={grants.reload} refreshing={grants.refreshing}>
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to allow or revoke a late submission.</Notice> : null}

      <ThemedText type="smallBold">Employee</ThemedText>
      {team.length === 0 ? (
        <Notice tone="info">
          {teamLoaded ? 'You have nobody in your team to allow a late submission for.' : 'Loading your team…'}
        </Notice>
      ) : (
        <>
          {team.length > 6 ? <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" /> : null}
          {shown.map((t) => {
            const selected = t.id === userId;
            return (
              <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ selected }} disabled={busy} onPress={() => setUserId(t.id)}>
                <ThemedView type="backgroundElement" style={[styles.card, selected && { borderColor: theme.primary }]}>
                  <ThemedText type="smallBold">{t.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[t.employeeCode, t.designation].filter(Boolean).join(' · ')}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            );
          })}
        </>
      )}

      <ThemedText type="smallBold">Plan</ThemedText>
      <ChoiceChips options={KINDS} value={kind} onChange={setKind} disabled={busy} />
      {kind === 'DAILY_PLAN' ? (
        <DateStepper label="Day" value={day} onChange={setDay} disabled={busy} />
      ) : (
        <MonthStepper value={month} onChange={setMonth} />
      )}
      <ThemedText type="smallBold">Valid for</ThemedText>
      <ChoiceChips options={DURATIONS} value={durationHours} onChange={setDurationHours} disabled={busy} />
      <TextField label="Why is the exception needed? (required)" value={reason} onChangeText={(t) => { setReason(t); setMsg(null); }} multiline maxLength={1000} editable={!busy} />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <PrimaryButton label="Allow late submission" loading={busy} disabled={!online || team.length === 0} onPress={grant} />

      <ThemedText type="smallBold">Exceptions</ThemedText>
      {grants.stale && grants.fetchedAt && grants.data ? (
        <Notice tone="info">{`Showing the list from ${formatWhen(grants.fetchedAt)}.`}</Notice>
      ) : null}
      {grants.error && !grants.data ? <Notice tone="danger">{grants.error}</Notice> : null}
      {grants.loading && !grants.data ? <Skeleton cards={2} lines={3} /> : null}
      {grants.data && items.length === 0 ? <Notice tone="info">No late-submission exceptions yet.</Notice> : null}
      {items.map((g) => (
        <ThemedView key={g.id} type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{g.userId === me?.id ? 'You' : (names.get(g.userId) ?? 'Employee')}</ThemedText>
          <ThemedText type="small">
            {g.kind === 'DAILY_PLAN' ? `Daily plan · ${prettyDay(g.planKey)}` : `Monthly plan · ${prettyMonth(g.planKey)}`}
          </ThemedText>
          <ThemedText type="small" themeColor={g.status === 'OPEN' ? 'primary' : 'textSecondary'}>
            {g.status === 'OPEN' ? `${GRANT_STATUS_LABEL.OPEN} · expires ${formatWhen(g.expiresAt)}` : GRANT_STATUS_LABEL[g.status]}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`“${g.reason}”`}</ThemedText>
          {g.status === 'OPEN' && g.grantedBy === me?.id ? (
            <PrimaryButton label="Revoke" variant="text" disabled={busy || !online} onPress={() => revoke(g.id)} />
          ) : null}
        </ThemedView>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one, borderWidth: 1, borderColor: 'transparent' },
});
