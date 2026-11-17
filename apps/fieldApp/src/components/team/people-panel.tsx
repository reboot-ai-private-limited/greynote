import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTeamBoard } from '@/hooks/use-team-board';
import { useFinancialYear } from '@/lib/financial-year';
import { getAllTeamDay, planChip, reportChip, useApprovalSummary, type BoardRow, type TeamBoard } from '@/lib/team-section';
import { useCachedFetch } from '@/offline/cached-fetch';
import { rollupText, sortByAttention, type TeamNode } from '@/lib/team-tree';
import { useOnline } from '@/offline';
import { formatWhen } from '@/offline/day';

import { ChoiceChips } from '../choice-chips';
import { Notice } from '../notice';
import { PrimaryButton } from '../primary-button';
import { Skeleton } from '../skeleton';
import { TextField } from '../text-field';
import { ThemedText } from '../themed-text';
import { Avatar, InfoCard, Pill } from '../ui-cards';

type Focus = 'ALL' | 'ATTENTION' | 'PLAN' | 'ON_LEAVE' | 'BLOCKED';
const FOCUS: { value: Focus; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'ATTENTION', label: 'Needs attention' },
  { value: 'PLAN', label: 'Plan not approved' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'BLOCKED', label: 'Blocked' },
];

const matches = (n: TeamNode, focus: Focus, row?: BoardRow) => {
  if (focus === 'ALL') return true;
  if (focus === 'BLOCKED') return n.day?.blocked === true;
  if (focus === 'ATTENTION') return n.day?.attention === true || n.day?.blocked === true;
  if (focus === 'PLAN') return !!row && !row.onLeave && !(row.plan && ['APPROVED', 'MANAGER_APPROVED'].includes(row.plan.status));
  return n.day?.state === 'ON_LEAVE' || row?.onLeave === true;
};

/** Four numbers a manager checks first. Tapping one narrows the list below to those people. */
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

/** Each level sits this far in from the one above, with a line down the left to show whose team it is. */
const INDENT = 14;

function PersonRow({ node, row, level, expanded, onToggle }: { node: TeamNode; row?: BoardRow | undefined; level: number; expanded: boolean; onToggle: (id: string) => void }) {
  const { member, day } = node;
  const chip = row?.onLeave || day?.state === 'ON_LEAVE' ? { text: 'On leave', accent: 'purple' as const } : planChip(row?.plan?.status ?? day?.plan?.status);
  const report = reportChip(row?.report?.status);
  const field = row?.plan ? !['MEETING', 'CONFERENCE', 'STRIKE'].includes(row.plan.workingType) : false;
  const isManager = node.children.length > 0;
  const canDecide = member.depth === 1;
  return (
    <View style={level > 0 ? [styles.nested, { marginLeft: Math.min(level, 4) * INDENT }] : undefined}>
    <InfoCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${member.name}`}
        onPress={() => router.push({ pathname: '/team-member', params: { id: member.id } })}
        style={styles.row}>
        <Avatar name={member.name} accent={day?.blocked ? 'red' : chip.accent === 'slate' ? 'blue' : chip.accent} size={42} />
        <View style={styles.grow}>
          <ThemedText type="smallBold" numberOfLines={2}>{member.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {[member.employeeCode, member.designation, member.hq?.name].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <View style={styles.pills}>
          {day?.blocked ? <Pill text="Blocked" accent="red" /> : <Pill text={chip.text} accent={chip.accent} />}
        </View>
      </Pressable>
      {row && !row.onLeave ? (
        <>
          <ThemedText type="small">
            {field ? (row.plan?.routes.length ? row.plan.routes.map((r) => r.name).join(', ') : 'No route') : row.plan ? row.plan.workingType.replace(/_/g, ' ').toLowerCase() : 'No plan for today'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {[field && row.summary.planned > 0 ? `${row.summary.visited} of ${row.summary.planned} doctors visited` : field ? 'No doctors planned' : null, report.text].filter(Boolean).join(' · ')}
          </ThemedText>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">{row?.onLeave || day?.leave ? (day?.leave?.leaveType ?? 'On leave') : 'No information for today'}</ThemedText>
      )}
      {isManager ? (
        <ThemedText type="small" themeColor={node.rollup.blocked > 0 ? 'danger' : 'textSecondary'}>
          {rollupText(node.rollup)}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Pill text={canDecide ? 'You decide' : 'View only'} accent={canDecide ? 'blue' : 'slate'} />
        {day?.blocked ? <PrimaryButton label="Unblock" variant="text" onPress={() => router.push({ pathname: '/unblock', params: { userId: member.id } })} /> : null}
        {isManager ? <PrimaryButton label={expanded ? `Hide team (${node.children.length}) ▾` : `Show team (${node.children.length}) ▸`} variant="text" onPress={() => onToggle(member.id)} /> : null}
      </View>
    </InfoCard>
    </View>
  );
}

/**
 * Team → Team: the team as a list you can drill into. Your direct reports come first; a manager among them shows how many are below
 * them and how many have not started or are blocked, and "Team ›" opens their people (an RSM or ZSM goes level by level, with a trail
 * back). Search or any filter looks across the whole team at once. The four numbers on top are today's, for everyone you can see.
 */
export function PeoplePanel({ onShowApprovals }: { onShowApprovals: () => void }) {
  const online = useOnline();
  const board = useTeamBoard();
  const pending = useApprovalSummary();
  const fy = useFinancialYear();
  const dayRows = useCachedFetch<TeamBoard>(`team-board:${fy.year}:${board.today}`, () => getAllTeamDay({ date: board.today, scope: 'all' }));
  const rowOf = useMemo(() => new Map((dayRows.data?.items ?? []).map((r) => [r.user.id, r])), [dayRows.data]);
  // The managers whose team is shown under them. Your direct reports are always listed; each manager among them opens in place.
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
  const expandAll = () => setOpen(new Set(all.filter((n) => n.children.length > 0).map((n) => n.member.id)));

  /** The team in hierarchical order: each person, then (if opened) their own people below them, level by level. */
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

  const t = board.tiles;
  const dt = dayRows.data?.totals;
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
      {board.loading ? <Skeleton cards={3} lines={2} /> : null}

      <PrimaryButton label="Today’s board: where everyone goes, which doctors →" variant="text" onPress={() => router.push('/team-board')} />
      {t ? (
        <View style={styles.tiles}>
          <Tile label="Pending approvals" value={pending.summary ? pending.summary.total : '–'} accent={pending.summary && pending.summary.total > 0 ? 'amber' : 'slate'} active={false} onPress={onShowApprovals} />
          <Tile label="Plan not approved" value={dt ? dt.planNotApproved : '–'} accent={dt && dt.planNotApproved > 0 ? 'amber' : 'slate'} active={focus === 'PLAN'} onPress={() => pick('PLAN')} />
          <Tile label="Reports in" value={dt ? `${dt.reportsIn}/${dt.people}` : '–'} accent="teal" active={false} onPress={() => router.push('/team-board')} />
          <Tile label="On leave" value={dt ? dt.onLeave : (t.ON_LEAVE ?? 0)} accent={(dt ? dt.onLeave : (t.ON_LEAVE ?? 0)) > 0 ? 'purple' : 'slate'} active={focus === 'ON_LEAVE'} onPress={() => pick('ON_LEAVE')} />
          <Tile label="Blocked" value={t.blocked} accent={t.blocked > 0 ? 'red' : 'slate'} active={focus === 'BLOCKED'} onPress={() => pick('BLOCKED')} />
        </View>
      ) : null}

      <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      <ChoiceChips options={FOCUS} value={focus} onChange={setFocus} />
      {designations.length > 1 ? (
        <ChoiceChips options={[{ value: 'ALL', label: 'All roles' }, ...designations.map((d) => ({ value: d, label: d }))]} value={designation} onChange={setDesignation} />
      ) : null}

      {!flat ? (
        <View style={styles.trail}>
          <ThemedText type="small" themeColor="text">My team</ThemedText>
          {hasManagers ? (
            <View style={styles.actions}>
              <PrimaryButton label="Expand all" variant="text" onPress={expandAll} />
              <PrimaryButton label="Collapse all" variant="text" onPress={() => setOpen(new Set())} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.trail}>
          <ThemedText type="small" themeColor="textSecondary">{`${shown.length} of ${board.count} in your team`}</ThemedText>
          <PrimaryButton label="Clear filters" variant="text" onPress={clear} />
        </View>
      )}

      {!board.loading && (flat ? shown.length === 0 : board.roots.length === 0) ? (
        <Notice tone="info">{flat ? 'Nobody matches.' : 'You have nobody in your team yet.'}</Notice>
      ) : null}
      {(flat ? shown.flatMap((n) => [{ node: n, level: 0, key: n.member.id }, ...(open.has(n.member.id) ? treeRows(n.children, 1).map((r) => ({ ...r, key: `${n.member.id}>${r.node.member.id}` })) : [])]) : treeRows(board.roots, 0).map((r) => ({ ...r, key: r.node.member.id }))).map(
        ({ node, level, key }) => (
          <PersonRow key={key} node={node} row={rowOf.get(node.member.id)} level={level} expanded={open.has(node.member.id)} onToggle={toggle} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: Spacing.three, padding: Spacing.two, gap: 2, minHeight: 74, justifyContent: 'space-between' },
  tileLabel: { fontSize: 11, lineHeight: 14 },
  trail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  nested: { borderLeftWidth: 2, borderLeftColor: '#CBD5E1', paddingLeft: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  pills: { alignItems: 'flex-end', gap: Spacing.one },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
