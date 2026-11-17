import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateStepper } from '@/components/date-stepper';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { BoardCard } from '@/components/team/board-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { useDebounced } from '@/hooks/use-debounced';
import { useTeamBoard } from '@/hooks/use-team-board';
import { useWindowed } from '@/hooks/use-windowed';
import { useFinancialYear } from '@/lib/financial-year';
import { getAllTeamDay, type BoardRow, type DayFilter, type TeamBoard } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { addDays } from '@/offline/day';

const FILTERS: { value: 'ALL' | DayFilter; label: string }[] = [
  { value: 'ALL', label: 'Everyone' },
  { value: 'PLAN_NOT_APPROVED', label: 'Plan not approved' },
  { value: 'NO_CALLS', label: 'No calls yet' },
  { value: 'REPORT_NOT_SENT', label: 'Report not sent' },
];

/**
 * The team board for a day (today by default, tomorrow too): per person where they go (routes by name), which doctors the plan lists by name and
 * which were called, what else they did and where the report stands. A manager's people sit under them. At the end of the day a card reads
 * "visited 4 of 5 doctors, 1 missed". Follows the financial year.
 */
export default function TeamBoardScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const { today } = useDayGate();
  const board = useTeamBoard();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<'ALL' | DayFilter>('ALL');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().toLowerCase(), 300);
  const tomorrow = addDays(today, 1);
  const min = fy.firstMonth ? `${fy.firstMonth}-01` : undefined;

  const day = useCachedFetch<TeamBoard>(`team-board:${fy.year}:${date}`, async () => {
    const all = await getAllTeamDay({ date, scope: 'all' });
    return all;
  });
  const data = day.data;
  // Each person under their manager: nearest first, then by name; a manager's people follow them.
  const rows = useMemo(() => {
    const byUser = new Map((data?.items ?? []).map((r) => [r.user.id, r]));
    const out: { row: BoardRow; level: number }[] = [];
    const walk = (ids: string[], level: number) => {
      for (const id of ids) {
        const node = board.byId.get(id);
        const row = byUser.get(id);
        if (row) out.push({ row, level });
        if (node) walk(node.children.map((c) => c.member.id), level + 1);
      }
    };
    walk(board.roots.map((n) => n.member.id), 0);
    for (const r of byUser.values()) if (!out.some((o) => o.row.user.id === r.user.id)) out.push({ row: r, level: 0 });
    return out;
  }, [data, board.byId, board.roots]);
  const shown = rows.filter(({ row }) => {
    if (term && !`${row.user.name} ${row.user.employeeCode}`.toLowerCase().includes(term)) return false;
    if (filter === 'PLAN_NOT_APPROVED') return !row.onLeave && !(row.plan && ['APPROVED', 'MANAGER_APPROVED'].includes(row.plan.status));
    if (filter === 'NO_CALLS') return !row.onLeave && row.summary.visited + row.doctors.alsoVisited.length + row.chemistCalls === 0;
    if (filter === 'REPORT_NOT_SENT') return !row.onLeave && !(row.report && ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'].includes(row.report.status));
    return true;
  });
  const { visible } = useWindowed(shown, `${date}|${filter}|${term}`);
  const t = data?.totals;

  return (
    <ScreenShell title="Today’s board" subtitle="Where each person goes, and what they did" onRefresh={day.reload} refreshing={day.refreshing}>
      <FyBanner />
      <DateStepper label="Day" value={date} onChange={(d) => setDate(d > tomorrow ? tomorrow : d)} {...(min ? { min } : {})} weekSteps />
      {!online ? <Notice tone="info">You’re offline. Showing the last copy.</Notice> : null}
      {day.error && online ? <Notice tone="danger">{day.error}</Notice> : null}
      {day.loading && !data ? <Skeleton cards={3} lines={3} /> : null}
      {t ? (
        <SummaryStrip
          items={[
            { label: 'People', value: t.people, accent: 'blue' },
            { label: 'Doctors visited', value: `${t.visitedDoctors}/${t.plannedDoctors}`, accent: 'green' },
            { label: 'Plan not approved', value: t.planNotApproved, accent: t.planNotApproved > 0 ? 'amber' : 'slate' },
            { label: 'Reports in', value: t.reportsIn, accent: 'teal' },
          ]}
        />
      ) : null}
      <ChoiceChips options={FILTERS} value={filter} onChange={setFilter} />
      <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      {data && shown.length === 0 ? <Notice tone="info">Nobody matches.</Notice> : null}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`Total ${shown.length}`}</ThemedText> : null}
      <View style={styles.list}>
        {visible.map(({ row, level }) => (
          <BoardCard key={row.user.id} row={row} past={Boolean(data?.past)} level={level} />
        ))}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ list: { gap: Spacing.two } });
