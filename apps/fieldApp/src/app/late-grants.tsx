import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateStepper } from '@/components/date-stepper';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Avatar, CardSection, InfoCard, PersonDropdown, Pill, sym } from '@/components/ui-cards';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import {
  GRANT_STATUS_LABEL,
  grantExpenseLate,
  grantLateSubmit,
  listAnyLateGrants,
  revokeAnyLateGrant,
  type AnyLateGrant,
  type ExpensePhase,
  type GrantStatus,
  type LateGrantDuration,
  type PlanKind,
} from '@/lib/late-grants';
import { useSessionUser } from '@/lib/session';
import { useColleagues, useOnline } from '@/offline';
import { formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';
import { useTeam } from '@/offline/team';

type Kind = PlanKind | 'EXPENSE';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'DAILY_PLAN', label: 'Daily plan' },
  { value: 'MONTHLY_PLAN', label: 'Tour plan' },
  { value: 'EXPENSE', label: 'Expenses' },
];
/** Who does what (2026-11-28): the employee sends late, or you approve late. */
const PHASES: { value: ExpensePhase; label: string; about: string }[] = [
  { value: 'SUBMIT', label: 'Let them send it late', about: 'They can send this month’s expenses after the deadline.' },
  { value: 'APPROVE', label: 'Let me approve it late', about: 'You can approve their sent month after the approval deadline.' },
];
/** How long the exception lasts, from the moment it is granted: only these three (decision-log 2026-11-19). */
const DURATIONS: { value: LateGrantDuration; label: string }[] = [
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '12h', label: '12 hours' },
];
const STATUS_ACCENT: Record<GrantStatus, Accent> = { OPEN: 'green', USED: 'slate', REVOKED: 'red', EXPIRED: 'amber' };
const PAGE = 10;

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.');

/** What an exception is for, in words. */
const whatOf = (g: AnyLateGrant) =>
  g.kind === 'DAILY_PLAN'
    ? `Daily plan · ${prettyDay(g.periodKey)}`
    : g.kind === 'MONTHLY_PLAN'
      ? `Tour plan · ${prettyMonth(g.periodKey)}`
      : g.kind === 'EXPENSE_SUBMIT'
        ? `Expenses · ${prettyMonth(g.periodKey)} · send late`
        : g.kind === 'EXPENSE_APPROVE'
          ? `Expenses · ${prettyMonth(g.periodKey)} · approve late`
          : `${g.kind.replace(/_/g, ' ').toLowerCase()} · ${g.periodKey}`;

/** Exceptions a page at a time ("Show more" adds the next), read again whenever the filter changes or `reload` is called. */
function useGrantPages(filter: { userId?: string; kinds?: string[]; status?: GrantStatus }) {
  const online = useOnline();
  const key = JSON.stringify(filter);
  const [state, setState] = useState<{ key: string; items: AnyLateGrant[]; total: number; page: number; loading: boolean; error: string | null }>({ key, items: [], total: 0, page: 0, loading: true, error: null });
  const load = useCallback(
    async (page: number) => {
      if (!online) return setState((s) => ({ ...s, loading: false, error: 'Connect to the internet to see the exceptions.' }));
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await listAnyLateGrants({ ...(JSON.parse(key) as typeof filter), page, pageSize: PAGE });
        setState((s) => ({ key, items: page === 1 || s.key !== key ? res.items : [...s.items, ...res.items], total: res.total, page, loading: false, error: null }));
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: errorText(err) }));
      }
    },
    [key, online],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(1), 0);
    return () => clearTimeout(t);
  }, [load]);
  const fresh = state.key === key;
  return { items: fresh ? state.items : [], total: fresh ? state.total : 0, loading: state.loading || !fresh, error: state.error, more: fresh && state.items.length < state.total, loadMore: () => void load(state.page + 1), reload: () => void load(1) };
}

/** One exception: who (in the team list), what, its status, the reason, who gave it; Revoke while it is unused and yours to revoke. */
function GrantRow({ g, who, onRevoke, busy, showWho }: { g: AnyLateGrant; who: string; onRevoke: (() => void) | null; busy: boolean; showWho: boolean }) {
  const theme = useTheme();
  const open = g.status === 'OPEN';
  return (
    <View style={[styles.grant, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.grantHead}>
        {showWho ? <Avatar name={who} accent={STATUS_ACCENT[g.status]} size={32} /> : null}
        <View style={styles.flex}>
          {showWho ? <ThemedText type="smallBold" numberOfLines={1}>{who}</ThemedText> : null}
          <ThemedText type={showWho ? 'small' : 'smallBold'} themeColor={showWho ? 'textSecondary' : undefined}>{whatOf(g)}</ThemedText>
        </View>
        <Pill text={open ? 'Active' : GRANT_STATUS_LABEL[g.status]} accent={STATUS_ACCENT[g.status]} />
      </View>
      {open ? <ThemedText type="small" style={{ color: Accents.green.solid }}>{`Not used yet · until ${formatWhen(g.expiresAt)}`}</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary">{`“${g.reason}” · given ${formatWhen(g.grantedAt)}`}</ThemedText>
      {onRevoke ? <PrimaryButton label="Revoke" variant="text" disabled={busy} onPress={onRevoke} /> : null}
    </View>
  );
}

/**
 * Late exceptions (2026-11-28), two ways in. From a person's page (`userId`): only that person — the form to allow one (no person picker) and
 * their own exceptions, newest first, ten at a time. From Team → Reports: your whole team's exceptions with filters, a tap on a person opens
 * their late exceptions, and "+ New exception" picks someone first. Expenses say who does what: they send late, or you approve late.
 * The server only lets a manager do this while Admin has switched it on, and says so when it is off. Needs a connection.
 */
export default function LateGrantsScreen() {
  const preset = useLocalSearchParams<{ userId?: string }>().userId;
  return typeof preset === 'string' && preset !== '' ? <PersonLateGrants userId={preset} /> : <TeamLateGrants />;
}

function PersonLateGrants({ userId }: { userId: string }) {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();
  const today = fy.effectiveToday;
  const { team } = useTeam();
  const { colleagues } = useColleagues();
  const person = team.find((t) => t.id === userId) ?? null;
  const name = person?.name ?? colleagues.find((c) => c.id === userId)?.name ?? 'This person';

  const [kind, setKind] = useState<Kind>('DAILY_PLAN');
  const [phase, setPhase] = useState<ExpensePhase>('SUBMIT');
  const [duration, setDuration] = useState<LateGrantDuration>('1h');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);
  const grants = useGrantPages({ userId });

  async function grant() {
    if (!reason.trim()) return setMsg({ tone: 'warning', text: 'Give the reason for the exception.' });
    setBusy(true);
    setMsg(null);
    try {
      if (kind === 'EXPENSE') {
        await grantExpenseLate({ userId, month, phase, reason, duration });
        setMsg({ tone: 'success', text: phase === 'SUBMIT' ? `${name} can now send ${prettyMonth(month)}’s expenses late.` : `You can now approve ${name}’s ${prettyMonth(month)} expenses late.` });
      } else {
        await grantLateSubmit({ userId, kind, planKey: kind === 'DAILY_PLAN' ? day : month, reason, duration });
        setMsg({ tone: 'success', text: `${name} can now submit that plan late.` });
      }
      setReason('');
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
      await revokeAnyLateGrant(id);
      setMsg({ tone: 'success', text: 'The exception was revoked.' });
      grants.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      title="Late exception"
      subtitle={`For ${name}`}
      onRefresh={grants.reload}
      refreshing={false}
      footer={<PrimaryButton label={`Allow for ${name.split(' ')[0]}`} loading={busy} disabled={!online || fy.isPast} onPress={grant} />}>
      <FyBanner />
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to allow or revoke an exception.</Notice> : null}
      <InfoCard>
        <View style={styles.grantHead}>
          <Avatar name={name} accent="blue" size={40} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{[person?.employeeCode, person?.designation].filter(Boolean).join(' · ') || 'Your team'}</ThemedText>
          </View>
        </View>
      </InfoCard>

      <CardSection icon={sym('calendar', 'event')} accent="amber" title="What">
        <ChoiceChips options={KINDS} value={kind} onChange={setKind} disabled={busy} />
        {kind === 'DAILY_PLAN' ? <DateStepper label="Day" value={day} onChange={setDay} disabled={busy} /> : <MonthStepper value={month} onChange={setMonth} />}
        {kind === 'EXPENSE' ? (
          <>
            <ChoiceChips options={PHASES.map(({ value, label }) => ({ value, label }))} value={phase} onChange={setPhase} disabled={busy} />
            <ThemedText type="small" themeColor="textSecondary">{PHASES.find((p) => p.value === phase)!.about}</ThemedText>
          </>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">Valid for</ThemedText>
        <ChoiceChips options={DURATIONS} value={duration} onChange={setDuration} disabled={busy} />
      </CardSection>
      <CardSection icon={sym('text.bubble', 'chat')} accent="purple" title="Reason">
        <TextField label="Why is the exception needed? (required)" value={reason} onChangeText={(t) => { setReason(t); setMsg(null); }} multiline maxLength={1000} editable={!busy} />
      </CardSection>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <CardSection icon={sym('clock.arrow.circlepath', 'history')} accent="green" title={`${name.split(' ')[0]}’s exceptions`} count={grants.total || undefined}>
        {grants.error ? <Notice tone="danger">{grants.error}</Notice> : null}
        {grants.loading && grants.items.length === 0 ? <Skeleton cards={2} lines={2} /> : null}
        {!grants.loading && grants.items.length === 0 && !grants.error ? <ThemedText type="small" themeColor="textSecondary">No exceptions yet.</ThemedText> : null}
        {grants.items.map((g) => (
          <GrantRow key={g.id} g={g} who={name} showWho={false} busy={busy || !online || fy.isPast} onRevoke={g.status === 'OPEN' && g.grantedBy === me?.id ? () => void revoke(g.id) : null} />
        ))}
        {grants.more ? <PrimaryButton label="Show more" variant="text" loading={grants.loading} onPress={grants.loadMore} /> : null}
      </CardSection>
    </ScreenShell>
  );
}

type StatusFilter = 'OPEN' | 'ALL';
type KindFilter = 'ALL' | 'DAILY_PLAN' | 'MONTHLY_PLAN' | 'EXPENSE_SUBMIT' | 'EXPENSE_APPROVE';

function TeamLateGrants() {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();
  const { team, loaded } = useTeam();
  const { colleagues } = useColleagues();
  const nameOf = (id: string) => (id === me?.id ? 'You' : (team.find((t) => t.id === id)?.name ?? colleagues.find((c) => c.id === id)?.name ?? 'Employee'));
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const grants = useGrantPages({ ...(status === 'OPEN' ? { status: 'OPEN' as GrantStatus } : {}), ...(kind !== 'ALL' ? { kinds: [kind] } : {}) });

  async function revoke(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await revokeAnyLateGrant(id);
      setMsg({ tone: 'success', text: 'The exception was revoked.' });
      grants.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      title="Late exceptions"
      subtitle="Your team’s exceptions to send or approve late"
      onRefresh={grants.reload}
      refreshing={false}
      footer={<PrimaryButton label="+ New exception" disabled={!online || fy.isPast} onPress={() => setPicking(true)} />}>
      <FyBanner />
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to see or change exceptions.</Notice> : null}
      {picking ? (
        <CardSection icon={sym('person.2', 'groups')} accent="blue" title="For whom?">
          {team.length === 0 ? (
            <Notice tone="info">{loaded ? 'You have nobody in your team.' : 'Loading your team…'}</Notice>
          ) : (
            <PersonDropdown
              people={team.map((t) => ({ id: t.id, name: t.name, detail: [t.employeeCode, t.designation].filter(Boolean).join(' · ') }))}
              value={null}
              onChange={(id) => {
                setPicking(false);
                router.push({ pathname: '/late-grants', params: { userId: id } });
              }}
            />
          )}
          <PrimaryButton label="Cancel" variant="text" onPress={() => setPicking(false)} />
        </CardSection>
      ) : null}
      <ChoiceChips options={[{ value: 'OPEN', label: 'Active' }, { value: 'ALL', label: 'All' }]} value={status} onChange={setStatus} />
      <ChoiceChips
        options={[
          { value: 'ALL', label: 'Every kind' },
          { value: 'DAILY_PLAN', label: 'Daily plan' },
          { value: 'MONTHLY_PLAN', label: 'Tour plan' },
          { value: 'EXPENSE_SUBMIT', label: 'Expenses · send' },
          { value: 'EXPENSE_APPROVE', label: 'Expenses · approve' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {grants.error ? <Notice tone="danger">{grants.error}</Notice> : null}
      {grants.loading && grants.items.length === 0 ? <Skeleton cards={3} lines={2} /> : null}
      {!grants.loading && grants.items.length === 0 && !grants.error ? <Notice tone="info">{status === 'OPEN' ? 'No active exceptions in your team.' : 'No exceptions yet.'}</Notice> : null}
      {grants.total > 0 ? <ThemedText type="small" themeColor="textSecondary">{`${grants.total} exception${grants.total === 1 ? '' : 's'}`}</ThemedText> : null}
      <View style={styles.list}>
        {grants.items.map((g) => (
          <View key={g.id}>
            <GrantRow g={g} who={nameOf(g.userId)} showWho busy={busy || !online || fy.isPast} onRevoke={g.status === 'OPEN' && g.grantedBy === me?.id ? () => void revoke(g.id) : null} />
            {g.userId !== me?.id ? <PrimaryButton label={`${nameOf(g.userId).split(' ')[0]}’s exceptions →`} variant="text" onPress={() => router.push({ pathname: '/late-grants', params: { userId: g.userId } })} /> : null}
          </View>
        ))}
      </View>
      {grants.more ? <PrimaryButton label="Show more" variant="text" loading={grants.loading} onPress={grants.loadMore} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: Spacing.two },
  grant: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.one },
  grantHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
