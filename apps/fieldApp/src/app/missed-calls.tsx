import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DoctorAvatar } from '@/components/doctor-avatar';
import { FyBanner } from '@/components/fy-banner';
import { ChoiceChips } from '@/components/choice-chips';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Meter, Pill, StatusBanner, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { getDoctorVisits, stageOf, type DoctorVisitMr, type DoctorVisitRow, type DoctorVisitsReport, type VisitStage } from '@/lib/doctor-visits';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFinancialYear } from '@/lib/financial-year';
import { listAllTeamMembers, type TeamMember } from '@/lib/team-section';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { FieldMasterDataSnapshot } from '@/types/sync';
import { formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';

/** The stage badge: all visits made, some made, or none yet. */
const STAGE: Record<VisitStage, { label: string; accent: Accent }> = {
  COMPLETE: { label: 'Complete', accent: 'green' },
  IN_PROGRESS: { label: 'In progress', accent: 'amber' },
  NOT_STARTED: { label: 'Not started', accent: 'red' },
};

/** The doctors in the server's order: most still to visit first. */
function DoctorRows({ rows }: { rows: DoctorVisitRow[] }) {
  // The report carries no photo: an own doctor's comes from the phone's doctor list; a team member's shows initials.
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const photoOf = (id: string) => master.data?.doctors.find((d) => d.id === id)?.photoUrl ?? null;
  return (
    <>
      {rows.map((r) => (
        <InfoCard key={r.doctor.id}>
          <View style={styles.row}>
            <DoctorAvatar name={r.doctor.name} photoUrl={photoOf(r.doctor.id)} size={36} />
            <ThemedText type="smallBold" style={styles.grow}>
              {r.doctor.name}
            </ThemedText>
            <Pill text={STAGE[stageOf(r)].label} accent={STAGE[stageOf(r)].accent} />
          </View>
          <Meter value={r.made} total={r.frequency} accent={STAGE[stageOf(r)].accent} />
          <ThemedText type="small" themeColor={r.missed === 0 ? 'primary' : 'danger'}>
            {r.missed === 0 ? `${r.made} of ${r.frequency} made · done` : `${r.made} of ${r.frequency} made · ${r.missed} remaining`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`${r.doctor.specialty} · target ${r.frequency} visit${r.frequency === 1 ? '' : 's'} a month`}</ThemedText>
          {r.plannedDays !== undefined && r.plannedDays > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {`${r.plannedDays} day${r.plannedDays === 1 ? '' : 's'} planned this month${r.missedSince ? ` · not called since planned on ${prettyDay(r.missedSince)}` : ''}`}
            </ThemedText>
          ) : r.missedSince ? (
            <ThemedText type="small" themeColor="danger">
              {`Planned on ${prettyDay(r.missedSince)}, not called yet`}
            </ThemedText>
          ) : null}
        </InfoCard>
      ))}
    </>
  );
}

type Totals = { quota: number; made: number; doctors: number; completedDoctors: number };
type Node = { member: TeamMember; own: DoctorVisitMr | null; children: Node[]; sum: Totals };

const add = (a: Totals, b: Totals): Totals => ({ quota: a.quota + b.quota, made: a.made + b.made, doctors: a.doctors + b.doctors, completedDoctors: a.completedDoctors + b.completedDoctors });
const ZERO: Totals = { quota: 0, made: 0, doctors: 0, completedDoctors: 0 };

/** The team as a tree under `rootId`: each person with their own report entry and the totals of everyone below them, most remaining first. */
function buildTree(rootId: string, members: TeamMember[], byId: Map<string, DoctorVisitMr>): Node[] {
  const kids = new Map<string, TeamMember[]>();
  for (const m of members) if (m.managerId) kids.set(m.managerId, [...(kids.get(m.managerId) ?? []), m]);
  const make = (m: TeamMember): Node => {
    const own = byId.get(m.id) ?? null;
    const children = (kids.get(m.id) ?? []).map(make);
    const sum = children.reduce((t, c) => add(t, c.sum), own ? { quota: own.quota, made: own.made, doctors: own.doctors, completedDoctors: own.completedDoctors } : ZERO);
    children.sort((a, b) => b.sum.quota - b.sum.made - (a.sum.quota - a.sum.made) || a.member.name.localeCompare(b.member.name));
    return { member: m, own, children, sum };
  };
  return (kids.get(rootId) ?? []).map(make).sort((a, b) => b.sum.quota - b.sum.made - (a.sum.quota - a.sum.made) || a.member.name.localeCompare(b.member.name));
}

const remaining = (t: Totals) => t.quota - t.made;
const rank = (m: TeamMember) => m.designation ?? (m.isManager ? 'Manager' : 'MR');

/**
 * One person in the tree. Each level is indented with a line down the left, a manager's line carries the totals of their whole team, and
 * tapping opens one level down (their doctors first). So an ASM and their MRs never look like the same level.
 */
function PersonNode({ node, level, open, toggle, forceOpen }: { node: Node; level: number; open: Set<string>; toggle: (id: string) => void; forceOpen: boolean }) {
  const { member, own, children, sum } = node;
  const isOpen = forceOpen || open.has(member.id);
  const expandable = children.length > 0 || (own?.rows.length ?? 0) > 0;
  const left = remaining(sum);
  return (
    <View style={[styles.stack, level > 0 && styles.indent]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} disabled={!expandable} onPress={() => toggle(member.id)}>
        <InfoCard>
          <View style={styles.row}>
            <Avatar name={member.name} accent={left === 0 ? 'green' : member.isManager ? 'indigo' : 'amber'} size={36} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{member.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`${member.employeeCode}${children.length > 0 ? ` · ${children.length} direct report${children.length === 1 ? '' : 's'}` : ''}`}</ThemedText>
            </View>
            <Pill text={rank(member)} accent={member.isManager ? 'indigo' : 'slate'} />
            {expandable ? <ThemedText type="small">{isOpen ? '▴' : '▾'}</ThemedText> : null}
          </View>
          <Meter value={sum.made} total={sum.quota} accent={left === 0 ? 'green' : 'amber'} />
          <ThemedText type="small" themeColor={left === 0 ? 'primary' : 'danger'}>
            {sum.quota === 0
              ? 'No visit targets set'
              : `${member.isManager ? 'Team: ' : ''}${sum.made} of ${sum.quota} made · ${left === 0 ? 'done' : `${left} remaining`} · ${sum.completedDoctors} of ${sum.doctors} doctors done`}
          </ThemedText>
        </InfoCard>
      </Pressable>
      {isOpen ? (
        <>
          {own && own.rows.length > 0 ? (
            <View style={styles.stack}>
              {member.isManager ? <ThemedText type="small" themeColor="textSecondary">{`${member.name.split(' ')[0]}’s own doctors`}</ThemedText> : null}
              <DoctorRows rows={own.rows} />
            </View>
          ) : null}
          {children.map((c) => (
            <PersonNode key={c.member.id} node={c} level={level + 1} open={open} toggle={toggle} forceOpen={forceOpen} />
          ))}
        </>
      ) : null}
    </View>
  );
}

/**
 * Visit targets (was "Missed Calls"): each doctor with a monthly visit target (set when adding a doctor, or by your manager or Admin),
 * against the calls made this month, as "made of target · remaining". This is the month's target, not the daily plan (a doctor planned and
 * not called is carried into the next day's Dr Call list; see docs/mobile/dcr.md). A manager sees the team as a tree, each manager's line
 * summing everyone below. Only calls on submitted or approved daily reports count. The last copy can be read offline.
 */
export default function MissedCallsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const { isManager } = useCurrentUser();
  const fy = useFinancialYear();

  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);

  const report = useCachedFetch<DoctorVisitsReport>(`doctor-visits:${fy.year}:${month}`, () => getDoctorVisits(month));
  const roster = useCachedFetch<TeamMember[]>(isManager ? 'team-roster-all' : 'team-roster-all:none', isManager ? async () => (await listAllTeamMembers()).items : async () => []);
  const data = report.data;
  const mine = data?.mrs.find((m) => m.mr.id === me?.id) ?? null;

  const [mode, setMode] = useState<'direct' | 'all'>('direct');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tree = useMemo(() => {
    if (!data || !me) return [];
    return buildTree(me.id, roster.data ?? [], new Map(data.mrs.map((m) => [m.mr.id, m])));
  }, [data, me, roster.data]);
  // A search lists the matching people (or people with a matching doctor), flat, each with the matching doctors.
  const found = useMemo(() => {
    if (!term) return [];
    const out: { member: TeamMember; rows: DoctorVisitRow[] }[] = [];
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        const personHit = n.member.name.toLowerCase().includes(term) || n.member.employeeCode.toLowerCase().includes(term);
        const rows = (n.own?.rows ?? []).filter((r) => personHit || r.doctor.name.toLowerCase().includes(term));
        if (personHit || rows.length > 0) out.push({ member: n.member, rows });
        walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [term, tree]);
  const myRows = (mine?.rows ?? []).filter((r) => !term || r.doctor.name.toLowerCase().includes(term));
  const left = data ? data.totals.quota - data.totals.made : 0;

  return (
    <ScreenShell title="Visit targets" subtitle="How many visits each doctor still needs this month" onRefresh={report.reload} refreshing={report.refreshing}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>

      {!online && !data ? <Notice tone="info">Connect once to load your visits for this month.</Notice> : null}
      {report.stale && report.fetchedAt && data && (!online || report.error) ? <Notice tone="info">{`Showing the copy from ${formatWhen(report.fetchedAt)}.`}</Notice> : null}
      {report.error && online ? <Notice tone="danger">{report.error}</Notice> : null}
      {!data && online && !report.error ? (
        <View style={styles.stack}>
          <Skeleton cards={1} lines={3} />
          <Skeleton cards={3} lines={2} />
        </View>
      ) : null}

      {data ? (
        <>
          <StatusBanner
            accent={left === 0 ? 'green' : 'amber'}
            icon={sym('phone.arrow.up.right', 'call_made')}
            title={`${prettyMonth(data.month)} · visits against targets`}
            text={`${data.totals.made} of ${data.totals.quota} visits made · ${left} remaining`}
          />
          <SummaryStrip
            items={[
              { label: 'Made', value: data.totals.made, accent: 'green' },
              { label: 'Remaining', value: left, accent: left === 0 ? 'slate' : 'red' },
              { label: 'Target', value: data.totals.quota, accent: 'blue' },
              { label: 'Doctors done', value: `${data.totals.completedDoctors}/${data.totals.doctors}`, accent: 'teal' },
            ]}
          />

          {data.mrs.length === 0 ? (
            <Notice tone="info">{'No doctor has a visit target yet. Set “Visits a month” when you add a doctor, or ask your manager or Admin to set it.'}</Notice>
          ) : null}

          {isManager && tree.length > 0 ? (
            <>
              <ChoiceChips
                options={[
                  { value: 'direct', label: 'Direct reports' },
                  { value: 'all', label: 'Whole team' },
                ]}
                value={mode}
                onChange={(v) => {
                  setMode(v as 'direct' | 'all');
                  setOpen(new Set());
                }}
              />
              <TextField label="Search a person or a doctor" value={search} onChangeText={setSearch} autoCapitalize="none" />
            </>
          ) : null}

          {myRows.length > 0 ? (
            <>
              <ThemedText type="smallBold">{isManager ? 'Your own doctors' : 'Your doctors'}</ThemedText>
              <DoctorRows rows={myRows} />
            </>
          ) : null}

          {isManager && tree.length > 0 ? (
            term ? (
              found.length === 0 ? (
                <Notice tone="info">Nobody or no doctor matches that search.</Notice>
              ) : (
                found.map(({ member, rows }) => (
                  <View key={member.id} style={styles.stack}>
                    <ThemedText type="smallBold">{`${member.name} · ${rank(member)}`}</ThemedText>
                    <DoctorRows rows={rows} />
                  </View>
                ))
              )
            ) : (
              <>
                <ThemedText type="smallBold">{mode === 'all' ? 'Your whole team' : 'Your team'}</ThemedText>
                {tree.map((n) => (
                  <PersonNode key={n.member.id} node={n} level={0} open={open} toggle={toggle} forceOpen={mode === 'all'} />
                ))}
              </>
            )
          ) : null}

          <ThemedText type="small" themeColor="textSecondary">
            Only calls on submitted or approved daily reports count, so today’s calls show once you submit the day.
          </ThemedText>
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  indent: { marginLeft: Spacing.three, paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: '#DCE7F6' },
});
