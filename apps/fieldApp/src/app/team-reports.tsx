import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { PillToggle } from '@/components/pill-toggle';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Avatar, IconChip, Meter, Pill, sym } from '@/components/ui-cards';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_LABEL, type ApprovalStatus } from '@/lib/approvals';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getSalesDashboard, listTeamDcrs, type SalesDashboardRow } from '@/lib/team';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, formatWhen, monthOf, prettyDay } from '@/offline/day';
import { useTeam } from '@/offline/team';

type Report = 'dcr' | 'sales';
const REPORTS: { value: Report; label: string }[] = [
  { value: 'dcr', label: 'Daily reports' },
  { value: 'sales', label: 'Sales & compliance' },
];

const statusText = (status: string) => STATUS_LABEL[status as ApprovalStatus] ?? (status === 'DRAFT' ? 'Not sent' : status);
const STATUS_ACCENT: Record<string, Accent> = { SUBMITTED: 'amber', MANAGER_APPROVED: 'amber', APPROVED: 'green', REJECTED: 'red' };

const bounds = (month: string) => {
  const days = datesInMonth(month);
  return { from: days[0]!, to: days[days.length - 1]! };
};

const rupees = (paise: number | null) => (paise === null ? '—' : formatRupees(paise));

/**
 * Team reports (managers): your downline's daily reports and a sales and compliance table, by month. Read-only, and the
 * server limits it to your own team. Needs a connection; the phone keeps the last copy of each month it loaded.
 */
export default function TeamReportsScreen() {
  const fy = useFinancialYear();
  const theme = useTheme();
  const [report, setReport] = useState<Report>('dcr');
  const [picked, setPicked] = useState<string | null>(null);

  const start = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const month = clamp(picked ?? start);

  return (
    <ScreenShell title="Team reports" subtitle="Your team’s reports, sales and plan compliance" wide>
      <FyBanner />
      <PillToggle options={REPORTS} value={report} onChange={setReport} />
      <View style={[styles.month, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={fy.lastMonth} />
      </View>
      {report === 'dcr' ? <TeamDcrList month={month} year={fy.year} /> : <TeamSales month={month} year={fy.year} />}
    </ScreenShell>
  );
}

function Stale({ fetchedAt, stale, error, online }: { fetchedAt: string | null; stale: boolean; error: string | null; online: boolean }) {
  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {stale && fetchedAt ? <Notice tone="info">{`${online ? 'Updating… ' : 'You’re offline. '}Showing the copy from ${formatWhen(fetchedAt)}.`}</Notice> : null}
    </>
  );
}

/* ───────────────────────────── the team's daily reports ───────────────────────────── */

function TeamDcrList({ month, year }: { month: string; year: number }) {
  const online = useOnline();
  const theme = useTheme();
  const { team } = useTeam();
  const names = useMemo(() => new Map(team.map((t) => [t.id, t.name])), [team]);
  const [who, setWho] = useState<string>('ALL');
  const { from, to } = bounds(month);
  const list = useCachedFetch(`team-dcr:${year}:${month}:${who}`, () => listTeamDcrs(from, to, who === 'ALL' ? null : who));
  const rows = [...(list.data ?? [])].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || (names.get(a.userId) ?? '').localeCompare(names.get(b.userId) ?? ''));

  return (
    <View style={styles.stack}>
      {team.length > 1 ? (
        <ChoiceChips options={[{ value: 'ALL', label: 'Everyone' }, ...team.map((t) => ({ value: t.id, label: t.name }))]} value={who} onChange={setWho} />
      ) : null}
      <View style={styles.sectionHeader}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          Daily reports
        </ThemedText>
        {list.data ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
            {`${rows.length} report${rows.length === 1 ? '' : 's'}`}
          </ThemedText>
        ) : null}
      </View>
      <Stale fetchedAt={list.fetchedAt} stale={list.stale} error={list.error} online={online} />
      {list.loading && !list.data ? (
        <Skeleton cards={3} lines={2} />
      ) : rows.length === 0 ? (
        <Notice tone="info">{list.data ? 'No daily reports from your team this month.' : 'Connect once to load your team’s reports.'}</Notice>
      ) : (
        rows.map((r) => {
          const name = names.get(r.userId) ?? 'Employee';
          const accent = STATUS_ACCENT[r.status] ?? 'slate';
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => (online ? router.push({ pathname: '/dcr-report/[id]', params: { id: r.id } }) : undefined)}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.background, borderColor: theme.border }, pressed && styles.pressed]}>
              <Avatar name={name} accent="teal" />
              <View style={styles.flex}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
                  {prettyDay(r.reportDate)}
                </ThemedText>
              </View>
              <Pill text={statusText(r.status)} accent={accent} />
              <ThemedText type="subtitle" themeColor="textSecondary" style={styles.chevron}>
                ›
              </ThemedText>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

/* ─────────────────────────── the team's sales and compliance ─────────────────────────── */

function Tile({ icon, accent, value, label }: { icon: ReturnType<typeof sym>; accent: Accent; value: string; label: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: Accents[accent].bg, borderColor: Accents[accent].border }]}>
      <IconChip icon={icon} accent={accent} size={32} />
      <ThemedText type="smallBold" style={styles.tileValue} numberOfLines={1}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.small} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

/** "3/20 sent · 2 approved" with a bar for how much of the working days it covers. */
function Compliance({ label, c, of, accent }: { label: string; c: { submitted: number; approved: number }; of: number; accent: Accent }) {
  return (
    <View style={styles.compliance}>
      <View style={styles.complianceHead}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
          {label}
        </ThemedText>
        <ThemedText type="small" style={styles.small}>{`${c.submitted}/${of} sent · ${c.approved} approved`}</ThemedText>
      </View>
      <Meter value={c.submitted} total={of} accent={accent} />
    </View>
  );
}

function SalesCard({ row }: { row: SalesDashboardRow }) {
  const theme = useTheme();
  const achievedPct = row.targetPaise && row.achievedPaise !== null ? Math.round((row.achievedPaise / row.targetPaise) * 100) : null;
  return (
    <View style={[styles.sales, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.salesHead}>
        <Avatar name={row.employee.name} accent="blue" />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {row.employee.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.small} numberOfLines={1}>
            {[row.employee.employeeCode, row.designation, row.zone].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <Pill text={`${row.workingDays} working days`} accent="slate" />
      </View>
      <Compliance label="Plans" c={row.plan} of={row.workingDays} accent="indigo" />
      <Compliance label="Daily reports" c={row.dcr} of={row.workingDays} accent="teal" />
      <View style={styles.figures}>
        <Figure label="TA" value={rupees(row.taPaise)} />
        <Figure label="DA" value={rupees(row.daPaise)} />
        <Figure label="Target" value={rupees(row.targetPaise)} />
        <Figure label="Achieved" value={`${rupees(row.achievedPaise)}${achievedPct !== null ? ` (${achievedPct}%)` : ''}`} />
        <Figure label="Primary" value={rupees(row.primaryPaise)} />
      </View>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.figure, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.figureLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.figureValue} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function TeamSales({ month, year }: { month: string; year: number }) {
  const online = useOnline();
  const { from, to } = bounds(month);
  const dash = useCachedFetch(`team-sales:${year}:${month}`, () => getSalesDashboard(from, to));
  const d = dash.data;

  return (
    <View style={styles.stack}>
      <Stale fetchedAt={dash.fetchedAt} stale={dash.stale} error={dash.error} online={online} />
      {dash.loading && !d ? <Skeleton cards={3} lines={4} /> : null}
      {d && d.rows.length === 0 ? <Notice tone="info">Nobody in your team yet.</Notice> : null}
      {d && d.rows.length > 0 ? (
        <>
          <View style={styles.tiles}>
            <Tile icon={sym('person.2', 'groups')} accent="blue" value={String(d.totals.employees)} label="Team members" />
            <Tile icon={sym('target', 'track_changes')} accent="red" value={rupees(d.totals.targetPaise)} label="Target" />
            <Tile icon={sym('chart.line.uptrend.xyaxis', 'trending_up')} accent="green" value={rupees(d.totals.achievedPaise)} label="Achieved" />
            <Tile icon={sym('indianrupeesign.circle', 'payments')} accent="amber" value={rupees(d.totals.taPaise + d.totals.daPaise)} label="TA + DA" />
          </View>
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              By employee
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
              {`Primary ${rupees(d.totals.primaryPaise)}`}
            </ThemedText>
          </View>
        </>
      ) : null}
      <View style={styles.cards}>
        {d?.rows.map((r) => (
          <View key={r.employee.id} style={styles.cardCell}>
            <SalesCard row={r} />
          </View>
        ))}
      </View>
      {d && d.total > d.rows.length ? <Notice tone="info">{`Showing ${d.rows.length} of ${d.total} employees.`}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: Spacing.three },
  month: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  chevron: { marginLeft: -Spacing.one },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: 2 },
  tileValue: { fontSize: 18, lineHeight: 24, marginTop: Spacing.one },
  // Cards sit one or two across; the padding on each cell makes the gap.
  cards: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  cardCell: { flexGrow: 1, flexBasis: 340, padding: 6 },
  sales: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  salesHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  compliance: { gap: 4 },
  complianceHead: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  figure: { flexGrow: 1, flexBasis: '30%', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  figureLabel: { fontSize: 11, lineHeight: 14 },
  figureValue: { fontSize: 13, lineHeight: 18 },
});
