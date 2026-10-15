import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTeamBoard } from '@/hooks/use-team-board';
import { DAY_STATE_TEXT, useApprovalSummary, type DayState } from '@/lib/team-section';
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

const STATE_ACCENT: Record<DayState, Accent> = { REPORTED: 'green', WORKING: 'blue', NOT_YET: 'slate', NOT_STARTED: 'red', MISSED: 'red', ON_LEAVE: 'purple', OFF: 'slate' };

type Focus = 'ALL' | 'ATTENTION' | 'NOT_STARTED' | 'ON_LEAVE' | 'BLOCKED';
const FOCUS: { value: Focus; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'ATTENTION', label: 'Needs attention' },
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'BLOCKED', label: 'Blocked' },
];

const matches = (n: TeamNode, focus: Focus) => {
  if (focus === 'ALL') return true;
  if (focus === 'BLOCKED') return n.day?.blocked === true;
  if (focus === 'ATTENTION') return n.day?.attention === true || n.day?.blocked === true;
  if (focus === 'NOT_STARTED') return n.day?.state === 'NOT_STARTED' || n.day?.state === 'MISSED';
  return n.day?.state === 'ON_LEAVE';
};

/** One line on what the person's day looks like: the plan, then the report if there is one. */
function dayLine(n: TeamNode): string {
  const d = n.day;
  if (!d) return 'No information for today';
  const plan = d.plan ? d.plan.workingType.replace(/_/g, ' ').toLowerCase() : 'no daily plan';
  const report = d.dcr ? ` · report ${d.dcr.status.toLowerCase().replace(/_/g, ' ')}, ${d.dcr.doctorCalls + d.dcr.chemistCalls} calls` : '';
  const leave = d.leave ? ` · ${d.leave.leaveType ?? 'leave'}` : '';
  const text = `${plan}${report}${leave}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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

function PersonRow({ node, level, expanded, onToggle }: { node: TeamNode; level: number; expanded: boolean; onToggle: (id: string) => void }) {
  const { member, day } = node;
  const state = day?.state ?? 'NOT_YET';
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
        <Avatar name={member.name} accent={day?.blocked ? 'red' : STATE_ACCENT[state]} size={42} />
        <View style={styles.grow}>
          <ThemedText type="smallBold" numberOfLines={2}>{member.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {[member.employeeCode, member.designation, member.hq?.name].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <View style={styles.pills}>
          {day?.blocked ? <Pill text="Blocked" accent="red" /> : <Pill text={DAY_STATE_TEXT[state]} accent={STATE_ACCENT[state]} />}
        </View>
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        {dayLine(node)}
      </ThemedText>
      {isManager ? (
        <ThemedText type="small" themeColor={node.rollup.blocked + node.rollup.notStarted > 0 ? 'danger' : 'textSecondary'}>
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
 * Team → People: the team as a list you can drill into. Your direct reports come first; a manager among them shows how many are below
 * them and how many have not started or are blocked, and "Team ›" opens their people (an RSM or ZSM goes level by level, with a trail
 * back). Search or any filter looks across the whole team at once. The four numbers on top are today's, for everyone you can see.
 */
export function PeoplePanel({ onShowApprovals }: { onShowApprovals: () => void }) {
  const online = useOnline();
  const board = useTeamBoard();
  const pending = useApprovalSummary();
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
        matches(n, focus) &&
        (designation === 'ALL' || n.member.designation === designation) &&
        (term === '' || `${n.member.name} ${n.member.employeeCode}`.toLowerCase().includes(term)),
    ),
  );

  const t = board.tiles;
  const notStarted = (t?.NOT_STARTED ?? 0) + (t?.MISSED ?? 0);
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

      {t ? (
        <View style={styles.tiles}>
          <Tile label="Pending approvals" value={pending.summary ? pending.summary.total : '–'} accent={pending.summary && pending.summary.total > 0 ? 'amber' : 'slate'} active={false} onPress={onShowApprovals} />
          <Tile label="Not started" value={notStarted} accent={notStarted > 0 ? 'red' : 'slate'} active={focus === 'NOT_STARTED'} onPress={() => pick('NOT_STARTED')} />
          <Tile label="On leave" value={t.ON_LEAVE ?? 0} accent={(t.ON_LEAVE ?? 0) > 0 ? 'purple' : 'slate'} active={focus === 'ON_LEAVE'} onPress={() => pick('ON_LEAVE')} />
          <Tile label="Blocked" value={t.blocked} accent={t.blocked > 0 ? 'red' : 'slate'} active={focus === 'BLOCKED'} onPress={() => pick('BLOCKED')} />
        </View>
      ) : null}
      {board.notStartedAfter && focus === 'NOT_STARTED' ? (
        <ThemedText type="small" themeColor="textSecondary">{`“Not started” counts people with no call logged after ${board.notStartedAfter}.`}</ThemedText>
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
          <ThemedText type="small" themeColor="textSecondary">{`${shown.length} of ${board.count} people`}</ThemedText>
          <PrimaryButton label="Clear filters" variant="text" onPress={clear} />
        </View>
      )}

      {!board.loading && (flat ? shown.length === 0 : board.roots.length === 0) ? (
        <Notice tone="info">{flat ? 'Nobody matches.' : 'You have nobody in your team yet.'}</Notice>
      ) : null}
      {(flat ? shown.flatMap((n) => [{ node: n, level: 0, key: n.member.id }, ...(open.has(n.member.id) ? treeRows(n.children, 1).map((r) => ({ ...r, key: `${n.member.id}>${r.node.member.id}` })) : [])]) : treeRows(board.roots, 0).map((r) => ({ ...r, key: r.node.member.id }))).map(
        ({ node, level, key }) => (
          <PersonRow key={key} node={node} level={level} expanded={open.has(node.member.id)} onToggle={toggle} />
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
