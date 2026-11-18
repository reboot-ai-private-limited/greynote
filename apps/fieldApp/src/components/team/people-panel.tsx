import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useTheme } from '@/hooks/use-theme';
import { useTeamBoard } from '@/hooks/use-team-board';
import { useWindowed } from '@/hooks/use-windowed';
import { useFinancialYear } from '@/lib/financial-year';
import { getAllTeamDay, useApprovalSummary, type BoardRow, type TeamBoard } from '@/lib/team-section';
import { rollupText, sortByAttention, type TeamNode } from '@/lib/team-tree';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { addDays, formatWhen } from '@/offline/day';

import { DayPicker } from '../day-picker';
import { Notice } from '../notice';
import { PrimaryButton } from '../primary-button';
import { SelectField } from '../select-field';
import { Skeleton } from '../skeleton';
import { TextField } from '../text-field';
import { ThemedText } from '../themed-text';
import { Pill } from '../ui-cards';
import { BoardCard } from './board-card';

type Focus = 'ALL' | 'ATTENTION' | 'PLAN' | 'NO_CALLS' | 'REPORT' | 'ON_LEAVE' | 'BLOCKED';
const FOCUS: { value: Focus; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'ATTENTION', label: 'Needs attention' },
  { value: 'PLAN', label: 'Daily plan waiting' },
  { value: 'NO_CALLS', label: 'No calls yet' },
  { value: 'REPORT', label: 'Report not sent' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'BLOCKED', label: 'Blocked' },
];

const REPORT_IN = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];
const planWaiting = (r?: BoardRow) => !!r && !r.onLeave && !!r.plan && ['SUBMITTED', 'REJECTED', 'REOPENED', 'WITHDRAWN'].includes(r.plan.status);

const matches = (n: TeamNode, focus: Focus, row?: BoardRow) => {
  if (focus === 'ALL') return true;
  if (focus === 'BLOCKED') return n.day?.blocked === true;
  if (focus === 'ATTENTION') return n.day?.attention === true || n.day?.blocked === true || planWaiting(row);
  if (focus === 'PLAN') return planWaiting(row);
  if (focus === 'NO_CALLS') return !!row && !row.onLeave && row.summary.visited + row.doctors.alsoVisited.length + row.chemistCalls === 0;
  if (focus === 'REPORT') return !!row && !row.onLeave && !(row.report && REPORT_IN.includes(row.report.status));
  return n.day?.state === 'ON_LEAVE' || row?.onLeave === true;
};

/** A person the day's read has no row for (new, or the read failed): an empty card, so they are still listed and can be opened. */
const emptyRow = (n: TeamNode): BoardRow => ({
  user: { id: n.member.id, employeeCode: n.member.employeeCode, name: n.member.name, depth: n.member.depth },
  plan: null,
  doctors: { planned: [], alsoVisited: [] },
  chemistCalls: 0,
  followups: 0,
  orders: { count: 0, amountPaise: 0 },
  report: null,
  onLeave: false,
  summary: { planned: 0, visited: 0, missed: 0 },
});

function Tile({ label, value, accent, active, onPress }: { label: string; value: number | string; accent: Accent; active: boolean; onPress: () => void }) {
  const c = Accents[accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={[styles.tile, { backgroundColor: c.bg, borderColor: active ? c.solid : c.border, borderWidth: active ? 2 : 1 }]}>
      <ThemedText type="smallBold" style={{ color: c.solid, fontSize: 22, lineHeight: 28 }} numberOfLines={1}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.tileLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Team → Team: the team board, the home of the Team tab (decision 2026-11-18). One card per person for the chosen day (today; yesterday and earlier show what
 * was missed; tomorrow shows the plan): the routes by name, the doctors by name with ✓ / – / ✗, the report. It keeps everything the old list did: open a person,
 * Unblock, "You decide / View only", a manager's team opening under them, the roll-up, search, role and focus filters, and the tiles.
 */
export function PeoplePanel({ onShowApprovals }: { onShowApprovals: () => void }) {
  const theme = useTheme();
  const online = useOnline();
  const board = useTeamBoard();
  const pending = useApprovalSummary();
  const fy = useFinancialYear();
  const { today } = useDayGate();
  const [date, setDate] = useState(today);
  const tomorrow = addDays(today, 1);
  const min = fy.firstMonth ? `${fy.firstMonth}-01` : undefined;
  const dayRows = useCachedFetch<TeamBoard>(`team-board:${fy.year}:${date}`, () => getAllTeamDay({ date, scope: 'all' }));
  const rowOf = useMemo(() => new Map((dayRows.data?.items ?? []).map((r) => [r.user.id, r])), [dayRows.data]);
  const past = date < today;

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<Focus>('ALL');
  const [designation, setDesignation] = useState('ALL');
  const term = search.trim().toLowerCase();

  const all = useMemo(() => [...board.byId.values()], [board.byId]);
  const designations = useMemo(() => [...new Set(all.map((n) => n.member.designation).filter((d): d is string => !!d))].sort(), [all]);
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const folders = all.filter((n) => n.children.length > 0);
  const allOpen = folders.length > 0 && folders.every((n) => open.has(n.member.id));
  const expandAll = () => setOpen(new Set(all.filter((n) => n.children.length > 0).map((n) => n.member.id)));

  const treeRows = (nodes: TeamNode[], level: number): { node: TeamNode; level: number }[] =>
    sortByAttention(nodes).flatMap((n) => [{ node: n, level }, ...(open.has(n.member.id) ? treeRows(n.children, level + 1) : [])]);

  const flat = term !== '' || focus !== 'ALL' || designation !== 'ALL';
  const hasManagers = all.some((n) => n.children.length > 0);
  const shown = sortByAttention(
    all.filter(
      (n) =>
        matches(n, focus, rowOf.get(n.member.id)) &&
        (designation === 'ALL' || n.member.designation === designation) &&
        (term === '' || `${n.member.name} ${n.member.employeeCode}`.toLowerCase().includes(term)),
    ),
  );
  const rows = flat
    ? shown.flatMap((n) => [{ node: n, level: 0, key: n.member.id }, ...(open.has(n.member.id) ? treeRows(n.children, 1).map((r) => ({ ...r, key: `${n.member.id}>${r.node.member.id}` })) : [])])
    : treeRows(board.roots, 0).map((r) => ({ ...r, key: r.node.member.id }));
  const { visible } = useWindowed(rows, `${date}|${term}|${focus}|${designation}|${[...open].join(',')}`);

  const t = board.tiles;
  const dt = dayRows.data?.totals;
  const waiting = dt ? (dt.plansWaiting ?? dt.planNotApproved) : null;
  const clear = () => {
    setSearch('');
    setFocus('ALL');
    setDesignation('ALL');
  };
  const pick = (next: Focus) => setFocus((f) => (f === next ? 'ALL' : next));

  return (
    <View style={styles.stack}>
      {!online ? <Notice tone="info">{`You’re offline. Showing the last copy of your team${board.fetchedAt ? ` from ${formatWhen(board.fetchedAt)}` : ''}.`}</Notice> : null}
      {board.error && online ? <Notice tone="danger">{board.error}</Notice> : null}
      {dayRows.error && online ? <Notice tone="danger">{dayRows.error}</Notice> : null}
      {board.loading ? <Skeleton cards={3} lines={2} /> : null}

      <DayPicker value={date} onChange={(d) => setDate(d > tomorrow ? tomorrow : d)} min={min} max={tomorrow} />

      {t ? (
        <View style={styles.tiles}>
          <Tile label="Pending approvals" value={pending.summary ? pending.summary.total : '–'} accent={pending.summary && pending.summary.total > 0 ? 'amber' : 'slate'} active={false} onPress={onShowApprovals} />
          <Tile label="Daily plans submitted" value={dt && dt.plansSubmitted !== undefined ? `${dt.plansSubmitted}/${dt.people}` : (waiting ?? '–')} accent={waiting ? 'amber' : 'teal'} active={focus === 'PLAN'} onPress={() => pick('PLAN')} />
          <Tile label="Reports in" value={dt ? `${dt.reportsIn}/${dt.people}` : '–'} accent="teal" active={focus === 'REPORT'} onPress={() => pick('REPORT')} />
          <Tile label="On leave" value={dt ? dt.onLeave : (t.ON_LEAVE ?? 0)} accent={(dt ? dt.onLeave : (t.ON_LEAVE ?? 0)) > 0 ? 'purple' : 'slate'} active={focus === 'ON_LEAVE'} onPress={() => pick('ON_LEAVE')} />
          <Tile label="Blocked" value={t.blocked} accent={t.blocked > 0 ? 'red' : 'slate'} active={focus === 'BLOCKED'} onPress={() => pick('BLOCKED')} />
        </View>
      ) : null}

      <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      <View style={styles.filters}>
        <SelectField label="Show" options={FOCUS} value={focus} onChange={setFocus} />
        {designations.length > 1 ? (
          <SelectField label="Role" options={[{ value: 'ALL', label: 'All roles' }, ...designations.map((d) => ({ value: d, label: d }))]} value={designation} onChange={setDesignation} />
        ) : null}
        {hasManagers ? (
          <Pressable accessibilityRole="button" accessibilityLabel={allOpen ? 'Collapse all' : 'Expand all'} onPress={allOpen ? () => setOpen(new Set()) : expandAll} style={[styles.toggle, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor="primary">{allOpen ? 'Collapse all' : 'Expand all'}</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {flat ? (
        <View style={styles.trail}>
          <ThemedText type="small" themeColor="textSecondary">{`${shown.length} of ${board.count} in your team`}</ThemedText>
          <PrimaryButton label="Clear filters" variant="text" onPress={clear} />
        </View>
      ) : null}

      {!board.loading && (flat ? shown.length === 0 : board.roots.length === 0) ? <Notice tone="info">{flat ? 'Nobody matches.' : 'You have nobody in your team yet.'}</Notice> : null}
      {visible.map(({ node, level, key }) => {
        const { member, day } = node;
        const isManager = node.children.length > 0;
        const canDecide = member.depth === 1;
        const row = rowOf.get(member.id) ?? emptyRow(node);
        return (
          <BoardCard
            key={key}
            row={row}
            past={past}
            level={level}
            subtitle={[member.employeeCode, member.designation, member.hq?.name].filter(Boolean).join(' · ')}
            footer={
              <>
                {isManager ? (
                  <ThemedText type="small" themeColor={node.rollup.blocked > 0 ? 'danger' : 'textSecondary'}>
                    {rollupText(node.rollup)}
                  </ThemedText>
                ) : null}
                <View style={styles.actions}>
                  <Pill text={canDecide ? 'You decide' : 'View only'} accent={canDecide ? 'blue' : 'slate'} />
                  {day?.blocked ? <Pill text="Blocked" accent="red" /> : null}
                  {day?.blocked ? <PrimaryButton label="Unblock" variant="text" onPress={() => router.push({ pathname: '/unblock', params: { userId: member.id } })} /> : null}
                  {isManager ? <PrimaryButton label={open.has(member.id) ? `Hide team (${node.children.length}) ▾` : `Show team (${node.children.length}) ▸`} variant="text" onPress={() => toggle(member.id)} /> : null}
                </View>
              </>
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: Spacing.three, padding: Spacing.two, gap: 2, minHeight: 74, justifyContent: 'space-between' },
  tileLabel: { fontSize: 11, lineHeight: 14 },
  filters: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  toggle: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, minHeight: 52, justifyContent: 'center' },
  trail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
