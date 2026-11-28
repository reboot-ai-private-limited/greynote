import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTeamBoard } from '@/hooks/use-team-board';
import { useWindowed } from '@/hooks/use-windowed';
import { useFinancialYear } from '@/lib/financial-year';
import { dailyPlanChip, getAllTeamDay, reportChip, type BoardRow, type TeamBoard } from '@/lib/team-section';
import { rollupText, sortByAttention, type TeamNode } from '@/lib/team-tree';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { addDays, formatWhen } from '@/offline/day';

import { DayPicker } from '../day-picker';
import { Notice } from '../notice';
import { PrimaryButton } from '../primary-button';
import { ChoiceChips } from '../choice-chips';
import { Skeleton } from '../skeleton';
import { TextField } from '../text-field';
import { ThemedText } from '../themed-text';
import { Avatar, Pill } from '../ui-cards';

type Focus = 'ALL' | 'PLAN' | 'NO_CALLS' | 'REPORT' | 'AWAY';

const REPORT_IN = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];
const PLAN_IN = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];
const callsOf = (r: BoardRow) => r.summary.visited + r.doctors.alsoVisited.length + r.chemistCalls;

/** What each tile filters to: plan not in yet (or sent back), no calls yet, report not sent, on leave or blocked. */
const matches = (n: TeamNode, focus: Focus, row?: BoardRow) => {
  if (focus === 'ALL') return true;
  if (focus === 'AWAY') return n.day?.blocked === true || n.day?.state === 'ON_LEAVE' || row?.onLeave === true;
  if (!row || row.onLeave) return false;
  if (focus === 'PLAN') return !(row.plan && PLAN_IN.includes(row.plan.status) && row.plan.status !== 'SUBMITTED');
  if (focus === 'NO_CALLS') return callsOf(row) === 0;
  return !(row.report && REPORT_IN.includes(row.report.status));
};

/** A person the day's read has no row for (new, or the read failed): still listed, and can be opened. */
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

/** A KPI tile that is also a filter: tap to show only those people, tap again to show everyone. */
function Tile({ label, value, accent, active, onPress }: { label: string; value: number | string; accent: Accent; active: boolean; onPress: () => void }) {
  const c = Accents[accent];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}: ${value}${active ? ', showing only these' : ''}`}
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

/** The day in one grey line: where, with whom, calls, the report. */
function dayLine(row: BoardRow): string {
  if (row.onLeave) return 'On leave';
  const plan = row.plan;
  const field = plan ? !['MEETING', 'CONFERENCE', 'STRIKE'].includes(plan.workingType) : false;
  const where = plan ? (field ? plan.routes.map((r) => r.name.split(' to ').pop() ?? r.name).join(', ') || 'No place' : plan.workingType.replace(/_/g, ' ').toLowerCase()) : 'No plan';
  const calls = callsOf(row);
  return [
    where,
    plan && plan.workWith.length > 0 ? `with ${plan.workWith.map((p) => p.label.split(' (')[0]).join(', ')}` : null,
    field ? `${calls} call${calls === 1 ? '' : 's'}` : null,
    reportChip(row.report?.status).text.toLowerCase(),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Team → Team (2026-11-28): who is doing what on a day, kept short. Four tiles that are also the filters (plans in, reports in, no calls yet,
 * on leave · blocked), a search and role chips, then one compact row per person: name, code · role · HQ, today's state, one line for the
 * day. A tap opens their page, where the day is in full (routes, each doctor ✓ / –). A manager's own team opens under them.
 */
export function PeoplePanel() {
  const theme = useTheme();
  const online = useOnline();
  const board = useTeamBoard();
  const fy = useFinancialYear();
  // In a past year Team's "today" is that year's last day, and the picker can't go past it.
  const today = fy.effectiveToday;
  const [dayChoice, setDayChoice] = useState<{ year: number; date: string } | null>(null);
  const date = dayChoice && dayChoice.year === fy.year ? dayChoice.date : today;
  const setDate = (d: string) => setDayChoice({ year: fy.year, date: d });
  const tomorrow = fy.isPast ? today : addDays(today, 1);
  const min = fy.firstMonth ? `${fy.firstMonth}-01` : undefined;
  const dayRows = useCachedFetch<TeamBoard>(`team-board:${fy.year}:${date}`, () => getAllTeamDay({ date, scope: 'all' }));
  const rowOf = useMemo(() => new Map((dayRows.data?.items ?? []).map((r) => [r.user.id, r])), [dayRows.data]);

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

  const treeRows = (nodes: TeamNode[], level: number): { node: TeamNode; level: number }[] =>
    sortByAttention(nodes).flatMap((n) => [{ node: n, level }, ...(open.has(n.member.id) ? treeRows(n.children, level + 1) : [])]);

  const flat = term !== '' || focus !== 'ALL' || designation !== 'ALL';
  const shown = sortByAttention(
    all.filter(
      (n) =>
        matches(n, focus, rowOf.get(n.member.id)) &&
        (designation === 'ALL' || n.member.designation === designation) &&
        (term === '' || `${n.member.name} ${n.member.employeeCode}`.toLowerCase().includes(term)),
    ),
  );
  const rows = flat ? shown.map((n) => ({ node: n, level: 0, key: n.member.id })) : treeRows(board.roots, 0).map((r) => ({ ...r, key: r.node.member.id }));
  const { visible } = useWindowed(rows, `${date}|${term}|${focus}|${designation}|${[...open].join(',')}`);

  const dt = dayRows.data?.totals;
  const count = (f: Focus) => all.filter((n) => matches(n, f, rowOf.get(n.member.id))).length;
  const blocked = board.tiles?.blocked ?? 0;
  const pick = (next: Focus) => setFocus((f) => (f === next ? 'ALL' : next));
  const clear = () => {
    setSearch('');
    setFocus('ALL');
    setDesignation('ALL');
  };

  return (
    <View style={styles.stack}>
      {!online ? <Notice tone="info">{`You’re offline. Showing the last copy of your team${board.fetchedAt ? ` from ${formatWhen(board.fetchedAt)}` : ''}.`}</Notice> : null}
      {board.error && online ? <Notice tone="danger">{board.error}</Notice> : null}
      {dayRows.error && online ? <Notice tone="danger">{dayRows.error}</Notice> : null}
      {board.loading ? <Skeleton cards={3} lines={2} /> : null}

      <DayPicker value={date} onChange={(d) => setDate(d > tomorrow ? tomorrow : d)} min={min} max={tomorrow} />

      {dt ? (
        <View style={styles.tiles}>
          <Tile label="Plans in" value={`${dt.plansSubmitted ?? dt.people - dt.planNotApproved}/${dt.people}`} accent={count('PLAN') > 0 ? 'amber' : 'green'} active={focus === 'PLAN'} onPress={() => pick('PLAN')} />
          <Tile label="Reports in" value={`${dt.reportsIn}/${dt.people}`} accent={dt.reportsIn >= dt.people - dt.onLeave ? 'green' : 'teal'} active={focus === 'REPORT'} onPress={() => pick('REPORT')} />
          <Tile label="No calls yet" value={count('NO_CALLS')} accent={count('NO_CALLS') > 0 ? 'red' : 'slate'} active={focus === 'NO_CALLS'} onPress={() => pick('NO_CALLS')} />
          <Tile label="On leave · Blocked" value={`${dt.onLeave} · ${blocked}`} accent={blocked > 0 ? 'red' : dt.onLeave > 0 ? 'purple' : 'slate'} active={focus === 'AWAY'} onPress={() => pick('AWAY')} />
        </View>
      ) : null}

      <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      {designations.length > 1 ? (
        <ChoiceChips options={[{ value: 'ALL', label: 'All roles' }, ...designations.map((d) => ({ value: d, label: d }))]} value={designation} onChange={setDesignation} />
      ) : null}

      {flat ? (
        <View style={styles.trail}>
          <ThemedText type="small" themeColor="textSecondary">{`${shown.length} of ${board.count} in your team`}</ThemedText>
          <PrimaryButton label="Show everyone" variant="text" onPress={clear} />
        </View>
      ) : null}

      {!board.loading && (flat ? shown.length === 0 : board.roots.length === 0) ? <Notice tone="info">{flat ? 'Nobody matches.' : 'You have nobody in your team yet.'}</Notice> : null}
      <View style={styles.list}>
        {visible.map(({ node, level, key }) => {
          const { member, day } = node;
          const isManager = node.children.length > 0;
          const row = rowOf.get(member.id) ?? emptyRow(node);
          const chip = day?.blocked ? { text: 'Blocked', accent: 'red' as Accent } : row.onLeave ? { text: 'On leave', accent: 'purple' as Accent } : dailyPlanChip(row.plan);
          return (
            <View key={key} style={level > 0 ? [styles.indent, { borderLeftColor: theme.border, marginLeft: Math.min(level, 3) * 14 }] : undefined}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${member.name}, ${chip?.text ?? 'no plan'}. Open their page`}
                onPress={() => router.push({ pathname: '/team-member', params: { id: member.id } })}
                style={({ pressed }) => [styles.row, { borderColor: day?.blocked ? Accents.red.border : theme.border, backgroundColor: theme.background }, pressed && styles.pressed]}>
                <Avatar name={member.name} accent={day?.blocked ? 'red' : row.onLeave ? 'purple' : isManager ? 'indigo' : 'blue'} size={40} />
                <View style={styles.grow}>
                  <View style={styles.nameLine}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>{member.name}</ThemedText>
                    {chip ? <Pill text={chip.text.replace('Daily plan ', 'Plan ')} accent={chip.accent} /> : null}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[member.employeeCode, member.designation, member.hq?.name, member.depth === 1 ? null : 'view only'].filter(Boolean).join(' · ')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{dayLine(row)}</ThemedText>
                  {isManager ? (
                    <ThemedText type="small" themeColor={node.rollup.blocked > 0 ? 'danger' : 'textSecondary'}>{`Team: ${rollupText(node.rollup)}`}</ThemedText>
                  ) : null}
                </View>
                <ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText>
              </Pressable>
              {day?.blocked || (isManager && !flat) ? (
                <View style={styles.actions}>
                  {day?.blocked ? <PrimaryButton label="Unblock" variant="text" disabled={fy.isPast} onPress={() => router.push({ pathname: '/unblock', params: { userId: member.id } })} /> : null}
                  {isManager && !flat ? <PrimaryButton label={open.has(member.id) ? `Hide their team (${node.children.length}) ▴` : `Show their team (${node.children.length}) ▾`} variant="text" onPress={() => toggle(member.id)} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  list: { gap: Spacing.two },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: Spacing.three, padding: Spacing.two, gap: 2, minHeight: 74, justifyContent: 'space-between' },
  tileLabel: { fontSize: 11, lineHeight: 14 },
  trail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  grow: { flex: 1, gap: 2 },
  indent: { paddingLeft: Spacing.two, borderLeftWidth: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap', paddingLeft: Spacing.two },
  pressed: { opacity: 0.7 },
});
