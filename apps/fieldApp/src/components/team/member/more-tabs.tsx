import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useWindowed } from '@/hooks/use-windowed';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getStatement, STATUS_TEXT, type ExpenseStatement } from '@/lib/expense-months';
import {
  getMemberAttendance,
  giftLine,
  getMemberDoctors,
  matchesDoctorFilter,
  getTeamLeaves,
  getTeamOrders,
  type AttendanceMonth,
  type DoctorFilter,
  type MemberDoctors,
  type TeamLeave,
  type TeamOrders,
} from '@/lib/team-section';
import { holdersText, listTeamChemistsPage, listTeamDistributorsPage, type TeamChemist, type TeamDistributor } from '@/lib/team-visibility';
import { PagedList } from './../paged-list';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';

import { ChoiceChips } from '../../choice-chips';
import { Notice } from '../../notice';
import { NumberedRow } from '../../numbered-row';
import { PrimaryButton } from '../../primary-button';
import { SelectField } from '../../select-field';
import { Skeleton } from '../../skeleton';
import { ThemedText } from '../../themed-text';
import { CardSection, InfoCard, Pill, SummaryStrip, sym } from '../../ui-cards';
import { SampleMatrix } from '../../sample-matrix';
import { giftStatusText, listPersonGifts, type GiftView } from '@/lib/gifts';
import { getSampleAccount, statusText, type SampleAccount } from '@/lib/sample-requests';
import { AttendanceCalendar } from './attendance-calendar';

const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

const Offline = ({ what }: { what: string }) => <Notice tone="info">{`Connect to see ${what}.`}</Notice>;

/** The month's TA/DA statement of the person: totals, status, and each day. Read only. */
export function ExpensesTab({ userId, month }: { userId: string; month: string }) {
  const online = useOnline();
  const fy = useFinancialYear();
  const q = useCachedFetch<ExpenseStatement>(`team-member-expenses:${fy.year}:${userId}:${month}`, () => getStatement(month, userId));
  const st = q.data;
  const rows = (st?.days ?? []).filter((d) => d.totalPaise > 0 || d.others.length > 0);
  const { visible } = useWindowed(rows, `${userId}|${month}`);
  return (
    <View style={styles.stack}>
      {!online && !st ? <Offline what="this person’s expenses" /> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && !st ? <Skeleton cards={2} lines={3} /> : null}
      {st ? (
        <>
          <InfoCard>
            <View style={styles.head}>
              <ThemedText type="smallBold" style={styles.grow}>Month statement</ThemedText>
              <Pill text={STATUS_TEXT[st.status].split(' — ')[0]!} accent={st.status === 'APPROVED' ? 'green' : st.status === 'SUBMITTED' ? 'amber' : st.status === 'REJECTED' ? 'red' : 'slate'} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {st.status === 'DRAFT' ? 'Not sent yet: the figures below are what the days come to so far.' : st.status === 'SUBMITTED' ? 'Waiting for the manager’s approval.' : st.status === 'APPROVED' ? `Approved${st.paidPaise > 0 ? `, ${formatRupees(st.paidPaise)} paid` : ''}.` : 'Sent back to the person.'}
            </ThemedText>
          </InfoCard>
          <SummaryStrip
            items={[
              { label: 'TA', value: formatRupees(st.totals.taPaise), accent: 'blue' },
              { label: 'DA', value: formatRupees(st.totals.daPaise), accent: 'teal' },
              { label: 'Other', value: formatRupees(st.totals.otherPaise), accent: 'purple' },
              { label: 'Total', value: formatRupees(st.totals.totalPaise), accent: 'green' },
            ]}
          />
          {rows.length === 0 ? <Notice tone="info">No expenses on any day this month.</Notice> : <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length} days`}</ThemedText>}
          {visible.map((d, i) => (
            <NumberedRow key={d.date} n={i + 1}>
              <InfoCard>
                <View style={styles.head}>
                  <ThemedText type="smallBold" style={styles.grow}>{prettyDay(d.date)}</ThemedText>
                  <ThemedText type="smallBold">{formatRupees(d.totalPaise)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(d.taPaise)} · DA ${formatRupees(d.daPaise)} · Other ${formatRupees(d.otherPaise)}`}</ThemedText>
                {d.others.map((o) => (
                  <ThemedText key={o.id} type="small">{`${formatRupees(o.amountPaise)}${o.remarks ? ` · ${o.remarks}` : ''}`}</ThemedText>
                ))}
              </InfoCard>
            </NumberedRow>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** Attendance as a calendar for the month, then the leaves in it. */
export function LeaveTab({ userId, month }: { userId: string; month: string }) {
  const online = useOnline();
  const fy = useFinancialYear();
  const att = useCachedFetch<AttendanceMonth>(`team-member-attendance:${fy.year}:${userId}:${month}`, () => getMemberAttendance(userId, month));
  const leaves = useCachedFetch<TeamLeave[]>(`team-member-leaves:${fy.year}:${userId}:${month}`, async () => (await getTeamLeaves({ from: `${month}-01`, to: monthEnd(month), userId })).items);
  const list = (Array.isArray(leaves.data) ? leaves.data : []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const a = att.data;
  return (
    <View style={styles.stack}>
      {!online && !a ? <Offline what="this person’s attendance" /> : null}
      {att.error && online ? <Notice tone="danger">{att.error}</Notice> : null}
      {att.loading && !a ? <Skeleton cards={2} lines={4} /> : null}
      {a ? (
        <CardSection icon={sym('calendar', 'event')} accent="purple" title="Attendance">
          <AttendanceCalendar days={a.days} counts={a.counts} />
        </CardSection>
      ) : null}
      <ThemedText type="smallBold">Leave this month</ThemedText>
      {leaves.data && list.length === 0 ? <Notice tone="info">No leave this month.</Notice> : null}
      {list.map((l) => (
        <InfoCard key={l.leaveId}>
          <View style={styles.head}>
            <ThemedText type="smallBold" style={styles.grow}>{`${l.leaveType ?? 'Leave'} · ${l.daysCount} ${l.daysCount === 1 ? 'day' : 'days'}`}</ThemedText>
            <Pill text={l.status === 'SUBMITTED' ? 'Waiting' : 'Approved'} accent={l.status === 'SUBMITTED' ? 'amber' : 'green'} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">{l.startDate === l.endDate ? prettyDay(l.startDate) : `${prettyDay(l.startDate)} → ${prettyDay(l.endDate)}`}</ThemedText>
        </InfoCard>
      ))}
    </View>
  );
}

type OrderFilter = 'ALL' | 'PLACED' | 'DONE' | 'CANCELLED';
/** The person's orders of the month, filterable by status. Chemist orders are information only and read as Placed. */
export function OrdersTab({ userId, month }: { userId: string; month: string }) {
  const online = useOnline();
  const fy = useFinancialYear();
  const [filter, setFilter] = useState<OrderFilter>('ALL');
  const q = useCachedFetch<TeamOrders>(`team-member-orders:${fy.year}:${userId}:${month}`, () => getTeamOrders({ from: `${month}-01`, to: monthEnd(month), userId }));
  const data = q.data;
  const rows = (data?.items ?? []).filter((o) => filter === 'ALL' || o.status === filter);
  const { visible } = useWindowed(rows, `${userId}|${month}|${filter}`);
  return (
    <View style={styles.stack}>
      <ChoiceChips
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'PLACED', label: 'Placed' },
          { value: 'DONE', label: 'Done' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {!online && !data ? <Offline what="this person’s orders" /> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && !data ? <Skeleton cards={2} lines={3} /> : null}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length}${filter === 'ALL' ? ` · ${formatRupees(data.totals.amountPaise)}` : ''}`}</ThemedText> : null}
      {data && rows.length === 0 ? <Notice tone="info">No orders.</Notice> : null}
      {visible.map((o, i) => (
        <NumberedRow key={o.id} n={i + 1}>
          <InfoCard>
            <View style={styles.head}>
              <View style={styles.grow}>
                <ThemedText type="smallBold">{o.outlet.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${o.outlet.type === 'CHEMIST' ? 'Chemist' : 'Distributor'} · ${prettyDay(o.orderDate)} · ${o.itemCount} product${o.itemCount === 1 ? '' : 's'}`}</ThemedText>
              </View>
              <ThemedText type="smallBold">{formatRupees(o.totalAmountPaise)}</ThemedText>
            </View>
            <Pill text={o.outlet.type === 'CHEMIST' ? 'Info only' : o.status === 'DONE' ? 'Done' : o.status === 'CANCELLED' ? 'Cancelled' : 'Placed'} accent={o.outlet.type === 'CHEMIST' ? 'slate' : o.status === 'DONE' ? 'green' : o.status === 'CANCELLED' ? 'red' : 'orange'} />
          </InfoCard>
        </NumberedRow>
      ))}
    </View>
  );
}

const DOCTOR_FILTERS: { value: DoctorFilter; label: string }[] = [
  { value: 'ALL', label: 'All doctors' },
  { value: 'NO_CALL', label: 'No call this month' },
  { value: 'BEHIND', label: 'Behind target' },
  { value: 'CARRIED', label: 'Carried over' },
];



export function DoctorsTab({ userId, month, filter, onFilter }: { userId: string; month: string; filter: DoctorFilter; onFilter: (f: DoctorFilter) => void }) {
  const online = useOnline();
  const fy = useFinancialYear();
  const q = useCachedFetch<MemberDoctors>(`team-member-doctors:${fy.year}:${userId}:${month}`, () => getMemberDoctors(userId, month));
  const data = q.data;
  const rows = (data?.items ?? []).filter((d) => matchesDoctorFilter(d, filter));
  const { visible } = useWindowed(rows, `${userId}|${month}|${filter}`);
  const totalServices = rows.reduce((n, d) => n + d.services.totalPaise, 0);
  return (
    <View style={styles.stack}>
      {!online && !data ? <Offline what="this person’s doctors" /> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && !data ? <Skeleton cards={3} lines={3} /> : null}
      {data ? <SelectField label="Show" options={DOCTOR_FILTERS} value={filter} onChange={onFilter} /> : null}
      {data ? <ThemedText type="small" themeColor="textSecondary">{`Total ${rows.length} doctors · services asked ${formatRupees(totalServices)}`}</ThemedText> : null}
      {data && rows.length === 0 ? <Notice tone="info">{filter === 'ALL' ? 'No doctors here yet.' : 'No doctor matches.'}</Notice> : null}
      {visible.map((d, i) => (
        <NumberedRow key={d.id} n={i + 1}>
          <InfoCard>
            <PrimaryButton label={d.name} variant="text" onPress={() => router.push({ pathname: '/team-doctor', params: { id: d.id, month } })} style={styles.name} />
            <ThemedText type="small" themeColor="textSecondary">{[d.specialty, d.routeName, d.heldBy && d.heldBy.id !== userId ? `held by ${d.heldBy.name}` : null].filter(Boolean).join(' · ')}</ThemedText>
            <ThemedText type="small" themeColor={d.visitFrequency && d.visitsThisMonth === 0 ? 'danger' : 'text'}>
              {`Visited ${d.visitsThisMonth}${d.visitFrequency ? ` of ${d.visitFrequency}` : ''} this month · last visit ${d.lastVisit ? prettyDay(d.lastVisit) : 'not recently'}`}
            </ThemedText>
            {d.carriedSince ? <ThemedText type="small" themeColor="warning">{`Carried over: planned ${prettyDay(d.carriedSince)}, not called since`}</ThemedText> : null}
            <ThemedText type="small" themeColor={giftLine(d.gifts).given ? 'text' : 'textSecondary'}>{`🎁 ${giftLine(d.gifts).text}`}</ThemedText>
            <ThemedText type="small" themeColor={d.services.count > 0 ? 'text' : 'textSecondary'}>
              {d.services.count > 0 ? `Services ${formatRupees(d.services.totalPaise)} · ${d.services.count} asked (${[d.services.waiting && `${d.services.waiting} waiting`, d.services.toDo && `${d.services.toDo} to do`, d.services.done && `${d.services.done} done`, d.services.rejected && `${d.services.rejected} rejected`].filter(Boolean).join(', ')})` : 'No services asked'}
            </ThemedText>
          </InfoCard>
        </NumberedRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  name: { alignSelf: 'flex-start' },
});

/** The chemists the person holds (a manager: the people below them hold), each with who holds it. */
export function ChemistsTab({ userId }: { userId: string }) {
  return (
    <PagedList<TeamChemist>
      resetKey={userId}
      fetchPage={(p, q) => listTeamChemistsPage(p, q, userId)}
      searchLabel="Search the chemist, or an MR’s name or code"
      emptyText="No chemists held here yet."
      offlineText="Connect to the internet to see the chemists."
      renderItem={(c) => (
        <InfoCard key={c.id}>
          <ThemedText type="smallBold">{c.name}</ThemedText>
          {c.address ? <ThemedText type="small" themeColor="textSecondary">{c.address}</ThemedText> : null}
          <ThemedText type="small" themeColor="textSecondary">{`Held by ${holdersText(c.assignedTo)}`}</ThemedText>
        </InfoCard>
      )}
    />
  );
}

/** The distributors the person holds (a manager: the people below them hold). */
export function DistributorsTab({ userId }: { userId: string }) {
  return (
    <PagedList<TeamDistributor>
      resetKey={userId}
      fetchPage={(p, q) => listTeamDistributorsPage(p, q, userId)}
      searchLabel="Search by name, GST or contact"
      emptyText="No distributors held here yet."
      offlineText="Connect to the internet to see the distributors."
      renderItem={(d) => (
        <InfoCard key={d.id}>
          <ThemedText type="smallBold">{d.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{[d.contactPerson, d.mobile, d.gstNumber].filter(Boolean).join(' · ')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`Held by ${holdersText(d.assignedTo)}`}</ThemedText>
        </InfoCard>
      )}
    />
  );
}

/**
 * What the person asked for, was credited ("got") and gave their doctors, per product — samples and LBL — and their recent requests with where each stands.
 * Read only. Left can be below zero (a call never checks a balance): shown in red so you can see who gave more than they were credited.
 */
export function SamplesTab({ userId }: { userId: string }) {
  const online = useOnline();
  const q = useCachedFetch<SampleAccount>(`team-member-samples:${userId}`, () => getSampleAccount(userId));
  const data = q.data;
  return (
    <View style={styles.stack}>
      {!online && !data ? <Offline what="this person’s samples and LBL" /> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && !data ? <Skeleton cards={2} lines={4} /> : null}
      {data ? (
        <>
          <CardSection icon={sym('pills', 'medication')} accent="amber" title="Samples">
            <SampleMatrix rows={data.samples} empty="No samples requested or given." />
          </CardSection>
          <CardSection icon={sym('doc.text', 'description')} accent="teal" title="LBL">
            <SampleMatrix rows={data.lbl} empty="No LBL requested or given." />
          </CardSection>
          <ThemedText type="small" themeColor="textSecondary">Asked = requested, Got = credited by Admin/Accounts/HR, Gave = given in doctor calls, Left = Got − Gave.</ThemedText>
          <ThemedText type="smallBold">Requests</ThemedText>
          {data.requests.length === 0 ? <Notice tone="info">No requests.</Notice> : null}
          {data.requests.map((r) => (
            <InfoCard key={r.id}>
              <ThemedText type="smallBold">{`${r.kind === 'SAMPLE' ? 'Sample' : 'LBL'} · ${prettyDay(r.requestedAt.slice(0, 10))} · ${statusText(r.status)}`}</ThemedText>
              <ThemedText type="small">{r.lines.map((l) => `${l.productName} × ${l.creditedQuantity ?? l.quantity}${l.creditedQuantity !== null && l.creditedQuantity !== l.quantity ? ` (asked ${l.quantity})` : ''}`).join(', ')}</ThemedText>
            </InfoCard>
          ))}
        </>
      ) : null}
    </View>
  );
}

type GiftFilter = 'ALL' | 'NOT_GIVEN' | 'DONE';

/**
 * The person's gifts for their doctors, both kinds (Admin allocated, or asked for by them), with where each stands. "Not given yet" is requested plus accepted and
 * still to hand over; a rejected request is in neither group. Read only.
 */
export function GiftsTab({ userId }: { userId: string }) {
  const online = useOnline();
  const [filter, setFilter] = useState<GiftFilter>('ALL');
  const q = useCachedFetch<GiftView[]>(`team-member-gifts:${userId}`, () => listPersonGifts(userId));
  const all = q.data ?? [];
  const notGiven = (g: GiftView) => g.status === 'REQUESTED' || g.status === 'PENDING';
  const rows = all.filter((g) => filter === 'ALL' || (filter === 'DONE' ? g.status === 'DONE' : notGiven(g)));
  const { visible } = useWindowed(rows, `${userId}|${filter}`);
  const requested = all.filter((g) => g.status === 'REQUESTED').length;
  return (
    <View style={styles.stack}>
      <SummaryStrip
        items={[
          { label: 'Gifts', value: String(all.length).padStart(2, '0'), accent: 'blue' },
          { label: 'Not given yet', value: String(all.filter(notGiven).length).padStart(2, '0'), accent: all.some(notGiven) ? 'amber' : 'slate' },
          { label: 'Requested', value: String(requested).padStart(2, '0'), accent: requested > 0 ? 'indigo' : 'slate' },
          { label: 'Given', value: String(all.filter((g) => g.status === 'DONE').length).padStart(2, '0'), accent: 'green' },
        ]}
      />
      <ChoiceChips
        options={[
          { value: 'ALL', label: 'All' },
          { value: 'NOT_GIVEN', label: 'Not given yet' },
          { value: 'DONE', label: 'Given' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {!online && !q.data ? <Offline what="this person’s gifts" /> : null}
      {q.error && online ? <Notice tone="danger">{q.error}</Notice> : null}
      {q.loading && !q.data ? <Skeleton cards={2} lines={3} /> : null}
      {q.data && rows.length === 0 ? <Notice tone="info">No gifts.</Notice> : null}
      {visible.map((g, i) => (
        <NumberedRow key={g.id} n={i + 1}>
          <InfoCard>
            <ThemedText type="smallBold">{g.productName}</ThemedText>
            <ThemedText type="small">{`For ${g.doctorName || 'a doctor'} · ${g.status === 'REQUESTED' ? 'amount set when accepted' : formatRupees(g.amountPaise)}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`${g.origin === 'EMPLOYEE' ? `Asked for${g.requestNote ? `: ${g.requestNote}` : ''}` : 'Allocated by Admin'} · ${giftStatusText(g.status)}${g.status === 'DONE' && g.completedAt ? ` on ${prettyDay(g.completedAt.slice(0, 10))}` : ''}${g.status === 'REJECTED' && g.rejectReason ? `: ${g.rejectReason}` : ''}`}</ThemedText>
          </InfoCard>
        </NumberedRow>
      ))}
    </View>
  );
}
