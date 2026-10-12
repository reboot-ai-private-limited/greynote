import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateStepper } from '@/components/date-stepper';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PillToggle } from '@/components/pill-toggle';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, PersonDropdown, Pill, sym } from '@/components/ui-cards';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  GRANT_STATUS_LABEL,
  grantExpenseLate,
  grantLateSubmit,
  listExpenseGrants,
  listLateGrants,
  revokeExpenseGrant,
  revokeLateGrant,
  type ExpenseGrant,
  type ExpensePhase,
  type GrantStatus,
  type LateGrant,
  type PlanKind,
} from '@/lib/late-grants';
import { useSessionUser } from '@/lib/session';
import { useColleagues, useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';
import { useTeam } from '@/offline/team';

type Kind = PlanKind | 'EXPENSE';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'DAILY_PLAN', label: 'Daily plan' },
  { value: 'MONTHLY_PLAN', label: 'Monthly plan' },
  { value: 'EXPENSE', label: 'Expenses' },
];

const PHASES: { value: ExpensePhase; label: string }[] = [
  { value: 'SUBMIT', label: 'Let them send it' },
  { value: 'APPROVE', label: 'Let it be approved' },
];

/** How long the exception lasts, from the moment it is granted (hours). The server allows up to `LATE_PLAN_GRANT_MAX_HOURS`, 744 by default. */
const DURATIONS = [
  { value: '24', label: '24h' },
  { value: '48', label: '48h' },
  { value: '168', label: '7 days' },
];

const STATUS_ACCENT: Record<GrantStatus, Accent> = { OPEN: 'green', USED: 'slate', REVOKED: 'red', EXPIRED: 'amber' };

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Late submissions (managers): let one of your team submit one plan after its deadline. Pick the person, the plan (a day or a
 * month) and a reason; the exception is good for a limited time and is used up by the submit. An unused one can be revoked.
 * The server only lets a manager do this while Admin has switched that on, and says so when it is off. Needs a connection.
 * On a tablet the form is on the left and the exceptions on the right.
 */
export default function LateGrantsScreen() {
  const theme = useTheme();
  const online = useOnline();
  const { isTablet } = useResponsive();
  const me = useSessionUser();
  const { today } = useDayGate();
  const { colleagues } = useColleagues();
  const { team, loaded: teamLoaded } = useTeam();
  const grants = useCachedFetch<{ items: LateGrant[]; total: number }>('late-grants', () => listLateGrants());

  const expenseGrants = useCachedFetch<{ items: ExpenseGrant[]; total: number }>('late-expense-grants', () => listExpenseGrants());
  const [phase, setPhase] = useState<ExpensePhase>('SUBMIT');
  const [durationHours, setDurationHours] = useState('24');

  // The employees a manager may grant to are their own team; every name we know, for the list below.
  const names = useMemo(
    () => new Map([...colleagues.map((c) => [c.id, c.label ?? c.name] as const), ...team.map((t) => [t.id, t.name] as const)]),
    [colleagues, team],
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('DAILY_PLAN');
  const isExpense = kind === 'EXPENSE';
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);

  async function grant() {
    if (!userId) return setMsg({ tone: 'warning', text: 'Pick the employee first.' });
    if (!reason.trim()) return setMsg({ tone: 'warning', text: 'Give the reason for the exception.' });
    setBusy(true);
    setMsg(null);
    try {
      const expiresAt = new Date(Date.now() + Number(durationHours) * 3600_000).toISOString();
      if (kind === 'EXPENSE') {
        await grantExpenseLate({ userId, month, phase, reason, expiresAt });
        setMsg({ tone: 'success', text: phase === 'SUBMIT' ? `${names.get(userId) ?? 'The employee'} can now send that month late.` : 'That month can now be approved late.' });
        expenseGrants.reload();
      } else {
        await grantLateSubmit({ userId, kind, planKey: kind === 'DAILY_PLAN' ? day : month, reason, expiresAt });
        setMsg({ tone: 'success', text: `${names.get(userId) ?? 'The employee'} can now submit that plan late.` });
        grants.reload();
      }
      setReason('');
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
      if (isExpense) {
        await revokeExpenseGrant(id);
        expenseGrants.reload();
      } else {
        await revokeLateGrant(id);
        grants.reload();
      }
      setMsg({ tone: 'success', text: 'The exception was revoked.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  const source = isExpense ? expenseGrants : grants;
  // Both kinds look the same in the list: who, what, the status and the reason.
  const items = (isExpense
    ? (expenseGrants.data?.items ?? []).map((g) => ({ id: g.id, userId: g.userId, grantedBy: g.grantedBy, reason: g.reason, expiresAt: g.expiresAt, status: g.effectiveStatus, what: `Expenses · ${prettyMonth(g.month)} · ${g.phase === 'SUBMIT' ? 'send late' : 'approve late'}` }))
    : (grants.data?.items ?? []).map((g) => ({ id: g.id, userId: g.userId, grantedBy: g.grantedBy, reason: g.reason, expiresAt: g.expiresAt, status: g.status, what: g.kind === 'DAILY_PLAN' ? `Daily plan · ${prettyDay(g.planKey)}` : `Monthly plan · ${prettyMonth(g.planKey)}` })));
  const picked = team.find((t) => t.id === userId) ?? null;

  const form = (
    <View style={styles.stack}>
      <CardSection icon={sym('person.2', 'groups')} accent="blue" title="Employee" count={team.length || undefined}>
        {team.length === 0 ? (
          <Notice tone="info">{teamLoaded ? 'You have nobody in your team to allow a late submission for.' : 'Loading your team…'}</Notice>
        ) : (
          <PersonDropdown
            people={team.map((t) => ({ id: t.id, name: t.name, detail: [t.employeeCode, t.designation].filter(Boolean).join(' · ') }))}
            value={userId}
            onChange={setUserId}
            disabled={busy}
          />
        )}
      </CardSection>

      <CardSection icon={sym('calendar', 'event')} accent="amber" title="Plan">
        <PillToggle options={KINDS} value={kind} onChange={setKind} disabled={busy} />
        {kind === 'DAILY_PLAN' ? (
          <DateStepper label="Day" value={day} onChange={setDay} disabled={busy} />
        ) : (
          <MonthStepper value={month} onChange={setMonth} />
        )}
        {isExpense ? <PillToggle options={PHASES} value={phase} onChange={setPhase} disabled={busy} /> : null}
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          Valid for
        </ThemedText>
        <ChoiceChips options={DURATIONS} value={durationHours} onChange={setDurationHours} disabled={busy} />
      </CardSection>

      <CardSection icon={sym('text.bubble', 'chat')} accent="purple" title="Reason">
        <TextField
          label="Why is the exception needed? (required)"
          value={reason}
          onChangeText={(t) => {
            setReason(t);
            setMsg(null);
          }}
          multiline
          maxLength={1000}
          editable={!busy}
        />
      </CardSection>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </View>
  );

  const exceptions = (
    <CardSection icon={sym('checklist', 'assignment_turned_in')} accent="green" title="Exceptions" count={items.length}>
      {source.stale && source.fetchedAt && source.data ? <Notice tone="info">{`Showing the list from ${formatWhen(source.fetchedAt)}.`}</Notice> : null}
      {source.error && !source.data ? <Notice tone="danger">{source.error}</Notice> : null}
      {source.loading && !source.data ? <Skeleton cards={2} lines={3} /> : null}
      {source.data && items.length === 0 ? <Notice tone="info">No late-submission exceptions yet.</Notice> : null}
      {items.map((g) => {
        const who = g.userId === me?.id ? 'You' : (names.get(g.userId) ?? 'Employee');
        const open = g.status === 'OPEN';
        return (
          <View key={g.id} style={[styles.grant, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.grantHead}>
              <Avatar name={who} accent={STATUS_ACCENT[g.status]} size={36} />
              <View style={styles.flex}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {who}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
                  {g.what}
                </ThemedText>
              </View>
              <Pill text={open ? 'Open' : GRANT_STATUS_LABEL[g.status]} accent={STATUS_ACCENT[g.status]} />
            </View>
            {open ? (
              <ThemedText type="small" style={[styles.small, { color: Accents.green.solid }]}>{`Not used yet · expires ${formatWhen(g.expiresAt)}`}</ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={styles.small}>{`“${g.reason}”`}</ThemedText>
            {open && g.grantedBy === me?.id ? (
              <PrimaryButton label="Revoke" variant="text" disabled={busy || !online} onPress={() => revoke(g.id)} />
            ) : null}
          </View>
        );
      })}
    </CardSection>
  );

  const footer = (
    <PrimaryButton
      label={picked ? `Allow late submission for ${picked.name}` : 'Allow late submission'}
      loading={busy}
      disabled={!online || team.length === 0}
      onPress={grant}
    />
  );

  return (
    <ScreenShell
      title="Late submissions"
      subtitle="Let someone submit a plan or expenses after the deadline"
      wide
      onRefresh={source.reload}
      refreshing={source.refreshing}
      footer={footer}>
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to allow or revoke a late submission.</Notice> : null}
      {isTablet ? (
        <View style={styles.columns}>
          <View style={styles.flex}>{form}</View>
          <View style={styles.flex}>{exceptions}</View>
        </View>
      ) : (
        <>
          {form}
          {exceptions}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: Spacing.three },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  label: { marginTop: Spacing.one },
  grant: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.one },
  grantHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  small: { fontSize: 12, lineHeight: 16 },
});
