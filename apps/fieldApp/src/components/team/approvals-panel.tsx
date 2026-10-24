import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { ApiError, NetworkError } from '@/lib/api';
import {
  APPROVAL_KINDS,
  LATE_APPROVAL_TEXT,
  STATUS_LABEL,
  bulkDecide,
  isLateApproval,
  kindLabel,
  listInbox,
  listTeam,
  type ApprovalFilter,
  type ApprovalItem,
  type ApprovalStatus,
  type TeamScope,
} from '@/lib/approvals';
import { useFinancialYear } from '@/lib/financial-year';
import { type ApprovalSummary } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useTeam } from '@/offline/team';

import { ApprovalRow } from '../approval-row';
import { ChoiceChips } from '../choice-chips';
import { Notice } from '../notice';
import { OutletPicker } from '../outlet-picker';
import { PillToggle } from '../pill-toggle';
import { PrimaryButton } from '../primary-button';
import { Skeleton } from '../skeleton';
import { TextField } from '../text-field';
import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';
import { PersonDropdown } from '../ui-cards';

type Tab = 'inbox' | 'all';
type Whose = Extract<TeamScope, 'all' | 'direct' | 'indirect'>;
type Period = 'ANY' | 'WEEK' | 'MONTH' | 'LAST_MONTH';

const TABS: { value: Tab; label: string }[] = [
  { value: 'inbox', label: 'To approve' },
  { value: 'all', label: 'All team requests' },
];
const WHOSE: { value: Whose; label: string }[] = [
  { value: 'all', label: 'All my team' },
  { value: 'direct', label: 'My direct reports' },
  { value: 'indirect', label: 'Their teams' },
];
const WHOSE_HELP: Record<Whose, string> = {
  all: 'Everyone below you. You decide your direct reports’ requests; the rest are view only.',
  direct: 'Your direct reports. These are the requests you decide.',
  indirect: 'People below your direct reports. View only: their own manager decides.',
};
const PERIODS: { value: Period; label: string }[] = [
  { value: 'ANY', label: 'Any time' },
  { value: 'WEEK', label: 'Last 7 days' },
  { value: 'MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
];
const STATUSES: { id: ApprovalStatus | 'ANY'; name: string }[] = [
  { id: 'ANY', name: 'All statuses' },
  { id: 'SUBMITTED', name: 'Waiting' },
  { id: 'APPROVED', name: 'Approved' },
  { id: 'REJECTED', name: 'Rejected' },
  { id: 'WITHDRAWN', name: 'Withdrawn' },
  { id: 'REOPENED', name: 'Reopened' },
];

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/** The instants a period covers, from the business "today" (`YYYY-MM-DD`). */
function rangeOf(period: Period, today: string): Pick<ApprovalFilter, 'from' | 'to'> {
  if (period === 'ANY') return {};
  const day = (iso: string, end = false) => new Date(`${iso}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDayOf = (year: number, month: number) => new Date(year, month, 0).getDate();
  if (period === 'WEEK') {
    const from = new Date(day(today).getTime() - 6 * 86_400_000);
    return { from, to: day(today, true) };
  }
  if (period === 'MONTH') return { from: day(`${y}-${pad(m)}-01`), to: day(`${y}-${pad(m)}-${pad(lastDayOf(y, m))}`, true) };
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return { from: day(`${py}-${pad(pm)}-01`), to: day(`${py}-${pad(pm)}-${pad(lastDayOf(py, pm))}`, true) };
}

type Props = {
  summary: ApprovalSummary | null;
  refreshSummary: () => void;
};

/**
 * Team → Approvals. "To approve" is what waits on you (your direct reports' requests); "All team requests" is everything below you,
 * with who decides it. Narrow either by type, person, period and overdue (and status and whose on the second list, as dropdowns).
 * On "To approve" the type chips show how many of each wait on you. Tick several and approve or reject them together, or "Select all" of one type. Needs a connection.
 */
export function ApprovalsPanel({ summary, refreshSummary }: Props) {
  const online = useOnline();
  const fy = useFinancialYear();
  const { today } = useDayGate();
  const { team } = useTeam();

  const [tab, setTab] = useState<Tab>('inbox');
  const [whose, setWhose] = useState<Whose>('all');
  const [kind, setKind] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [status, setStatus] = useState<ApprovalStatus | 'ANY'>('ANY');
  const [period, setPeriod] = useState<Period>('ANY');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStep, setBulkStep] = useState<null | 'approve' | 'reject'>(null);
  const [bulkComment, setBulkComment] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);

  const range = useMemo(() => rangeOf(period, today), [period, today]);
  const fromMs = range.from?.getTime();
  const toMs = range.to?.getTime();

  useEffect(() => {
    if (!online) return;
    let alive = true;
    const filter: ApprovalFilter = {
      ...(kind ? { kind } : {}),
      ...(personId ? { submitterId: personId } : {}),
      ...(tab === 'all' && status !== 'ANY' ? { status } : {}),
      ...(fromMs !== undefined && toMs !== undefined ? { from: new Date(fromMs), to: new Date(toMs) } : {}),
    };
    (async () => {
      try {
        const page = tab === 'inbox' ? await listInbox(100, filter) : await listTeam(whose, 100, filter);
        if (!alive) return;
        setItems(page.items);
        setError(null);
      } catch (err) {
        if (alive) setError(errorText(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [online, tab, whose, kind, personId, status, fromMs, toMs, reloadKey, fy.year]);

  const shown = (items ?? []).filter((i) => !overdueOnly || i.overdue);
  // A past year is read-only: nothing in it can be decided from here.
  const actionable = fy.isPast ? [] : shown.filter((i) => i.canAct);
  const pickedItems = actionable.filter((i) => selected.has(i.id));

  const counts = useMemo(() => new Map((summary?.byKind ?? []).map((k) => [k.kind, k])), [summary]);
  const kindChips = [
    { value: 'ALL', label: tab === 'inbox' && summary ? `All (${summary.total})` : 'All types' },
    ...APPROVAL_KINDS.filter((k) => tab === 'all' || (counts.get(k)?.count ?? 0) > 0 || k === kind).map((k) => ({
      value: k as string,
      label: tab === 'inbox' && counts.get(k) ? `${kindLabel(k)} (${counts.get(k)!.count}${counts.get(k)!.overdue > 0 ? `, ${counts.get(k)!.overdue} late` : ''})` : kindLabel(k),
    })),
  ];

  const people = team.map((t) => ({ id: t.id, name: t.name, detail: [t.employeeCode, t.designation].filter(Boolean).join(' · ') }));
  const personName = people.find((p) => p.id === personId)?.name;

  const active: { key: string; label: string; clear: () => void }[] = [];
  if (kind) active.push({ key: 'kind', label: kindLabel(kind), clear: () => setKind(null) });
  if (personId) active.push({ key: 'person', label: personName ?? 'One person', clear: () => setPersonId(null) });
  if (tab === 'all' && status !== 'ANY') active.push({ key: 'status', label: STATUS_LABEL[status], clear: () => setStatus('ANY') });
  if (period !== 'ANY') active.push({ key: 'period', label: PERIODS.find((p) => p.value === period)!.label, clear: () => setPeriod('ANY') });
  if (overdueOnly) active.push({ key: 'overdue', label: 'Overdue only', clear: () => setOverdueOnly(false) });
  const clearAll = () => {
    setKind(null);
    setPersonId(null);
    setStatus('ANY');
    setPeriod('ANY');
    setOverdueOnly(false);
  };

  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setBulkStep(null);
    setBulkComment('');
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const reset = () => {
    endSelecting();
    setItems(null);
    setError(null);
  };

  const runBulk = async () => {
    if (!bulkStep || pickedItems.length === 0) return;
    if (bulkStep === 'reject' && !bulkComment.trim()) {
      setBulkMsg({ tone: 'danger', text: 'Give the reason for rejecting — the employees will see it.' });
      return;
    }
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const { results } = await bulkDecide(bulkStep === 'approve' ? 'APPROVE' : 'REJECT', pickedItems, bulkComment);
      const done = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      const word = bulkStep === 'approve' ? 'approved' : 'rejected';
      setBulkMsg(
        failed.length === 0
          ? { tone: 'success', text: `${done} request${done === 1 ? '' : 's'} ${word}.` }
          : { tone: 'warning', text: `${done} ${word}, ${failed.length} not done: ${failed.map((f) => (f.ok ? '' : isLateApproval(f.statusCode, f.message) ? LATE_APPROVAL_TEXT : f.message)).join('; ')}` },
      );
      endSelecting();
      setReloadKey((k) => k + 1);
      refreshSummary();
    } catch (err) {
      setBulkMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBulkBusy(false);
    }
  };

  const typeWord = kind ? kindLabel(kind).toLowerCase() : 'request';

  return (
    <View style={styles.stack}>
      <PillToggle
        options={TABS}
        value={tab}
        onChange={(next) => {
          reset();
          setStatus('ANY');
          setTab(next);
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {tab === 'inbox' ? 'Requests from your direct reports that wait for your decision.' : WHOSE_HELP[whose]}
      </ThemedText>

      {tab === 'inbox' ? (
        <ChoiceChips options={kindChips} value={kind ?? 'ALL'} onChange={(v) => { reset(); setKind(v === 'ALL' ? null : v); }} />
      ) : (
        <>
          <View style={styles.dropdownRow}>
            <View style={styles.dropdown}>
              <OutletPicker
                label="Type"
                options={kindChips.map((k) => ({ id: k.value, name: k.label }))}
                value={kind ?? 'ALL'}
                onChange={(v) => { reset(); setKind(v === 'ALL' ? null : v); }}
                emptyText="No types."
              />
            </View>
            <View style={styles.dropdown}>
              <OutletPicker
                label="Status"
                options={STATUSES}
                value={status}
                onChange={(v) => { reset(); setStatus(v as ApprovalStatus | 'ANY'); }}
                emptyText="No statuses."
              />
            </View>
          </View>
          <OutletPicker
            label="Whose"
            options={WHOSE.map((w) => ({ id: w.value, name: w.label }))}
            value={whose}
            onChange={(v) => { reset(); setWhose(v as Whose); }}
            emptyText="No choices."
          />
        </>
      )}

      <PrimaryButton label={showMore ? 'Hide filters' : `More filters${active.length > 0 ? ` (${active.length})` : ''}`} variant="text" onPress={() => setShowMore((s) => !s)} />
      {showMore ? (
        <ThemedView type="backgroundElement" style={styles.filters}>
          <ThemedText type="smallBold">Person</ThemedText>
          {people.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">Your team list is loading.</ThemedText>
          ) : (
            <PersonDropdown people={people} value={personId} onChange={(id) => { reset(); setPersonId(id); }} placeholder="Any person" />
          )}
          <ThemedText type="smallBold">Period</ThemedText>
          <ChoiceChips options={PERIODS} value={period} onChange={(v) => { reset(); setPeriod(v); }} />
          <ThemedText type="smallBold">Overdue</ThemedText>
          <ChoiceChips options={[{ value: 'no', label: 'All' }, { value: 'yes', label: 'Overdue only' }]} value={overdueOnly ? 'yes' : 'no'} onChange={(v) => setOverdueOnly(v === 'yes')} />
        </ThemedView>
      ) : null}

      {active.length > 0 ? (
        <View style={styles.activeRow}>
          {active.map((a) => (
            <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={`Remove filter ${a.label}`} onPress={() => { reset(); a.clear(); }} style={[styles.activeChip, { backgroundColor: Accents.blue.bg, borderColor: Accents.blue.border }]}>
              <ThemedText type="small" style={{ color: Accents.blue.solid }}>{`${a.label}  ✕`}</ThemedText>
            </Pressable>
          ))}
          <PrimaryButton label="Clear all" variant="text" onPress={() => { reset(); clearAll(); }} />
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>{tab === 'inbox' ? 'Waiting for you' : 'Team requests'}</ThemedText>
        {items ? (
          <ThemedText type="small" themeColor="textSecondary">{`${shown.length} request${shown.length === 1 ? '' : 's'}`}</ThemedText>
        ) : null}
      </View>

      {tab === 'inbox' && actionable.length > 0 && !selecting ? (
        <View style={styles.selectRow}>
          <PrimaryButton label="Select several" variant="text" onPress={() => { setBulkMsg(null); setSelecting(true); }} />
          <PrimaryButton
            label={`Select all ${actionable.length}${kind ? ` ${typeWord}${actionable.length === 1 ? '' : 's'}` : ''}`}
            variant="text"
            onPress={() => { setBulkMsg(null); setSelecting(true); setSelected(new Set(actionable.map((i) => i.id))); }}
          />
        </View>
      ) : null}
      {selecting ? (
        <ThemedView type="backgroundElement" style={styles.bulk}>
          <ThemedText type="smallBold">{`${pickedItems.length} selected`}</ThemedText>
          {bulkStep ? (
            <>
              <TextField
                label={bulkStep === 'approve' ? 'Comment (optional)' : 'Reason (required)'}
                value={bulkComment}
                onChangeText={(t) => { setBulkComment(t); setBulkMsg(null); }}
                multiline
                maxLength={500}
                editable={!bulkBusy}
              />
              <PrimaryButton label={bulkStep === 'approve' ? `Confirm: approve ${pickedItems.length}` : `Confirm: reject ${pickedItems.length}`} loading={bulkBusy} onPress={runBulk} />
              <PrimaryButton label="Back" variant="text" disabled={bulkBusy} onPress={() => setBulkStep(null)} />
            </>
          ) : (
            <>
              <PrimaryButton label={`Approve ${pickedItems.length}`} disabled={pickedItems.length === 0} onPress={() => { setBulkMsg(null); setBulkStep('approve'); }} />
              <PrimaryButton label={`Reject ${pickedItems.length}`} variant="text" disabled={pickedItems.length === 0} onPress={() => { setBulkMsg(null); setBulkStep('reject'); }} />
              <PrimaryButton label="Cancel" variant="text" onPress={endSelecting} />
            </>
          )}
        </ThemedView>
      ) : null}
      {bulkMsg ? <Notice tone={bulkMsg.tone}>{bulkMsg.text}</Notice> : null}

      {!online ? <Notice tone="info">You’re offline. Approvals need the internet — connect to see and decide requests.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {online && items === null && !error ? <Skeleton cards={3} lines={3} /> : null}
      {items !== null && shown.length === 0 ? (
        <Notice tone="info">
          {active.length > 0
            ? 'Nothing matches these filters.'
            : tab === 'inbox'
            ? 'Nothing is waiting for you. New requests from your team show up here.'
            : 'No requests from your team yet.'}
        </Notice>
      ) : null}
      {shown.map((item) => (
        <ApprovalRow
          key={item.id}
          item={item}
          selecting={selecting && item.canAct}
          selected={selected.has(item.id)}
          onPress={() => (selecting ? (item.canAct ? toggle(item.id) : undefined) : router.push({ pathname: '/approval/[id]', params: { id: item.id } }))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  filters: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  dropdownRow: { flexDirection: 'row', gap: Spacing.two },
  dropdown: { flex: 1 },
  activeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  activeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, lineHeight: 22 },
  // Text buttons carry no padding of their own, so the row spaces them apart.
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.four, rowGap: Spacing.two, paddingVertical: Spacing.one },
  bulk: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
