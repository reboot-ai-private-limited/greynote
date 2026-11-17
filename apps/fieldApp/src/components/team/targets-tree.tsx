import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useWindowed } from '@/hooks/use-windowed';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getEmployeeSalesReport } from '@/lib/sales';
import { listAllTeamMembers, type TeamMember } from '@/lib/team-section';
import { useCachedFetch } from '@/offline/cached-fetch';

import { NumberedRow } from '../numbered-row';
import { Notice } from '../notice';
import { TextField } from '../text-field';
import { ThemedText } from '../themed-text';
import { Avatar, InfoCard, Meter, Pill } from '../ui-cards';

const accentFor = (p: number | null): Accent => (p === null ? 'slate' : p >= 100 ? 'green' : p >= 50 ? 'amber' : 'red');

/** One person: their figures load when the line is on screen (a person never shown costs nothing); a manager's line is their approved team report, with what is still waiting under it. */
function PersonLine({ member, reports, month, level, open, toggle }: { member: TeamMember; reports: TeamMember[]; month: string; level: number; open: Set<string>; toggle: (id: string) => void }) {
  const fy = useFinancialYear();
  const report = useCachedFetch(`targets-node:${fy.year}:${month}:${member.id}`, () => getEmployeeSalesReport(member.id, month, month));
  const r = report.data;
  const isOpen = open.has(member.id);
  const expandable = reports.length > 0;
  const waiting = r?.team?.waitingPaise ?? 0;
  return (
    <View style={[styles.stack, level > 0 && styles.indent]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} disabled={!expandable} onPress={() => toggle(member.id)}>
        <InfoCard>
          <View style={styles.row}>
            <Avatar name={member.name} accent={member.isManager ? 'indigo' : 'blue'} size={36} />
            <View style={styles.grow}>
              <ThemedText type="smallBold">{member.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`${member.employeeCode}${expandable ? ` · ${reports.length} direct report${reports.length === 1 ? '' : 's'}` : ''}`}</ThemedText>
            </View>
            <Pill text={member.designation ?? (member.isManager ? 'Manager' : 'MR')} accent={member.isManager ? 'indigo' : 'slate'} />
            {expandable ? <ThemedText type="small">{isOpen ? '▴' : '▾'}</ThemedText> : null}
          </View>
          {r ? (
            <>
              <Meter value={r.totals.secondaryPaise} total={r.totals.targetPaise} accent={accentFor(r.totals.achievementPercent)} />
              <ThemedText type="small">{`Target ${formatRupees(r.totals.targetPaise)} · Achieved ${formatRupees(r.totals.secondaryPaise)} · ${r.totals.achievementPercent === null ? 'no target' : `${r.totals.achievementPercent}%`}`}</ThemedText>
              {waiting > 0 ? (
                <ThemedText type="small" themeColor="warning">{`Waiting for approval above: ${formatRupees(waiting)}${r.team?.approvedMrCount !== undefined ? ` · ${r.team.approvedMrCount} of ${r.team.mrCount} MRs approved` : ''}`}</ThemedText>
              ) : null}
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">{report.error ? 'Couldn’t load these figures.' : 'Loading…'}</ThemedText>
          )}
        </InfoCard>
      </Pressable>
    </View>
  );
}

function Branch({ rootChildren, kids, month, level, open, toggle }: { rootChildren: TeamMember[]; kids: Map<string, TeamMember[]>; month: string; level: number; open: Set<string>; toggle: (id: string) => void }) {
  return (
    <>
      {rootChildren.map((m) => (
        <View key={m.id} style={styles.stack}>
          <PersonLine member={m} reports={kids.get(m.id) ?? []} month={month} level={level} open={open} toggle={toggle} />
          {open.has(m.id) ? <Branch rootChildren={kids.get(m.id) ?? []} kids={kids} month={month} level={level + 1} open={open} toggle={toggle} /> : null}
        </View>
      ))}
    </>
  );
}

/**
 * The manager's team for Targets, as a tree: direct reports first, a tap opens one level down, each line indented. A manager's line shows
 * their own approved team report and, under it, what is still waiting for approval above. 20 lines at a time as you scroll; a search lists matches.
 */
export function TargetsTree({ rootId, month }: { rootId: string; month: string }) {
  const roster = useCachedFetch<TeamMember[]>('targets-roster', async () => (await listAllTeamMembers()).items);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().toLowerCase(), 300);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const members = useMemo(() => (Array.isArray(roster.data) ? roster.data : []), [roster.data]);
  const kids = useMemo(() => {
    const m = new Map<string, TeamMember[]>();
    for (const t of members) if (t.managerId) m.set(t.managerId, [...(m.get(t.managerId) ?? []), t].sort((a, b) => a.name.localeCompare(b.name)));
    return m;
  }, [members]);
  const direct = kids.get(rootId) ?? [];
  const found = term ? members.filter((t) => `${t.name} ${t.employeeCode}`.toLowerCase().includes(term)) : [];
  const list = term ? found : direct;
  const { visible } = useWindowed(list, term);

  if (roster.loading && members.length === 0) return <Notice tone="info">Loading your team…</Notice>;
  if (members.length === 0) return null;
  return (
    <View style={styles.stack}>
      <ThemedText type="smallBold">Your team</ThemedText>
      <TextField label="Search a person" value={search} onChangeText={setSearch} autoCapitalize="none" />
      {term && found.length === 0 ? <Notice tone="info">Nobody matches that search.</Notice> : null}
      <ThemedText type="small" themeColor="textSecondary">{`Total ${list.length}${term ? ' found' : ''}`}</ThemedText>
      {term
        ? visible.map((m, i) => (
            <NumberedRow key={m.id} n={i + 1}>
              <PersonLine member={m} reports={[]} month={month} level={0} open={open} toggle={toggle} />
            </NumberedRow>
          ))
        : visible.map((m, i) => (
            <NumberedRow key={m.id} n={i + 1}>
              <Branch rootChildren={[m]} kids={kids} month={month} level={0} open={open} toggle={toggle} />
            </NumberedRow>
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  indent: { marginLeft: Spacing.three, paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: '#DCE7F6' },
});
