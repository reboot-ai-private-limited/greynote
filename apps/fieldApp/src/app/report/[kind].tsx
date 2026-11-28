import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ReportList, ReportRow } from '@/components/report-kit';
import { STATUS_ACCENT } from '@/components/reports';
import { ScreenShell } from '@/components/screen-shell';
import { InfoCard } from '@/components/ui-cards';
import { ThemedText } from '@/components/themed-text';
import { STATUS_LABEL, type ApprovalStatus } from '@/lib/approvals';
import { getDoctorVisits, stageOf, type DoctorVisitsReport, type VisitStage } from '@/lib/doctor-visits';
import { useFinancialYear } from '@/lib/financial-year';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { listGifts, type GiftView } from '@/lib/gifts';
import { listMyLeaves, type LeaveView } from '@/lib/leave';
import { listOrders, orderValue, type OrderView } from '@/lib/marketing';
import { formatRupees } from '@/lib/money';
import { getEmployeeSalesReport, type EmployeeSalesReport } from '@/lib/sales';
import { listMySampleRequests, type SampleRequestView } from '@/lib/sample-requests';
import { listMyServices, SERVICE_TYPE_LABEL, serviceStage, type ServiceView } from '@/lib/services';
import { useSessionUser } from '@/lib/session';
import { getStockCounts, STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, type StockCountsMonth } from '@/lib/stock-counts';
import { rupees } from '@/lib/xlsx';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, monthOf, prettyDay, prettyMonth } from '@/offline/day';
import type { FieldMasterDataSnapshot } from '@/types/sync';

/**
 * One of your own reports for a month (2026-11-28, Reports → More): view only, short rows, one Excel button that downloads exactly
 * the rows shown. The month and the financial year follow the Reports tab and can be changed here.
 */

type Kind = 'orders' | 'leave' | 'gifts' | 'services' | 'samples' | 'visits' | 'targets' | 'secondary';
const TITLES: Record<Kind, { title: string; subtitle: string }> = {
  orders: { title: 'Orders', subtitle: 'Your orders this month' },
  leave: { title: 'Leave', subtitle: 'Your leave touching this month' },
  gifts: { title: 'Gifts', subtitle: 'Gifts for your doctors this month' },
  services: { title: 'Doctor services', subtitle: 'Services you asked for this month' },
  samples: { title: 'Sample & LBL requests', subtitle: 'What you asked the office for' },
  visits: { title: 'Doctor visits', subtitle: 'Visits made against each doctor’s target' },
  targets: { title: 'Targets', subtitle: 'Your sales target and achievement' },
  secondary: { title: 'Secondary sales', subtitle: 'Units and value by distributor' },
};

const inMonth = (iso: string | null | undefined, month: string) => !!iso && iso.slice(0, 7) === month;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fileOf = (what: string, month: string, name: string | null | undefined) => `GREYNOTE ${what} ${month} ${(name ?? 'Me').replace(/[^\w .-]/g, '').trim() || 'Me'}.xlsx`;
const statusText = (s: string) => STATUS_LABEL[s as ApprovalStatus] ?? s.charAt(0) + s.slice(1).toLowerCase();

type Props = { month: string; year: number };

function OrdersReport({ month, year }: Props) {
  const me = useSessionUser();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const orders = useCachedFetch<OrderView[]>(`rep-orders:${year}`, listOrders);
  const name = (o: OrderView) => (o.outlet.type === 'CHEMIST' ? master.data?.chemists : master.data?.distributors)?.find((x) => x.id === o.outlet.id)?.name ?? (o.outlet.type === 'CHEMIST' ? 'Chemist' : 'Distributor');
  const rows = (orders.data ?? []).filter((o) => o.orderDate.startsWith(month) && (!me || o.userId === me.id)).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const LABEL: Record<string, string> = { PLACED: 'Placed', DONE: 'Done', CANCELLED: 'Cancelled' };
  const total = rows.filter((o) => o.status !== 'CANCELLED').reduce((n, o) => n + orderValue(o), 0);
  return (
    <ReportList
      title="Orders"
      rows={rows}
      state={orders}
      hasData={orders.data !== null}
      tiles={[
        { label: 'Orders', value: rows.length, accent: 'blue' },
        { label: 'Value', value: formatRupees(total), accent: 'green' },
        { label: 'Done', value: rows.filter((o) => o.status === 'DONE').length, accent: 'teal' },
      ]}
      empty="No orders this month."
      render={(o) => (
        <ReportRow key={o.id} title={name(o)} subtitle={`${prettyDay(o.orderDate)} · ${plural(o.items.length, 'item')}`} value={formatRupees(orderValue(o))} pill={{ text: LABEL[o.status] ?? o.status, accent: STATUS_ACCENT[o.status] ?? 'slate' }} />
      )}
      fileName={fileOf('ORDERS', month, me?.name)}
      sheet={() => ({
        sheet: `Orders ${month}`,
        title: `${me?.name ?? ''} · Orders · ${prettyMonth(month)}`,
        header: ['Date', 'Outlet', 'Type', 'Items', 'Value (₹)', 'Status'],
        rows: rows.map((o) => [o.orderDate, name(o), o.outlet.type === 'CHEMIST' ? 'Chemist' : 'Distributor', o.items.length, rupees(orderValue(o)), LABEL[o.status] ?? o.status]),
        totals: ['Total', '', '', rows.reduce((n, o) => n + o.items.length, 0), rupees(total), ''],
      })}
    />
  );
}

function LeaveReport({ month }: Props) {
  const me = useSessionUser();
  const leaves = useCachedFetch<LeaveView[]>('rep-leave', listMyLeaves);
  const days = datesInMonth(month);
  const rows = (leaves.data ?? []).filter((l) => l.startDate <= days[days.length - 1]! && l.endDate >= days[0]!).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const span = (l: LeaveView) => (l.startDate === l.endDate ? prettyDay(l.startDate) : `${prettyDay(l.startDate)} – ${prettyDay(l.endDate)}`);
  return (
    <ReportList
      title="Leave"
      rows={rows}
      state={leaves}
      hasData={leaves.data !== null}
      empty="No leave this month."
      render={(l) => <ReportRow key={l.id} title={l.leaveTypeName} subtitle={`${span(l)} · ${plural(l.daysCount, 'day')}${l.isPaid ? '' : ' · unpaid'}`} pill={{ text: statusText(l.status), accent: STATUS_ACCENT[l.status] ?? 'slate' }} />}
      fileName={fileOf('LEAVE', month, me?.name)}
      sheet={() => ({
        sheet: `Leave ${month}`,
        title: `${me?.name ?? ''} · Leave · ${prettyMonth(month)}`,
        header: ['From', 'To', 'Type', 'Days', 'Paid', 'Status', 'Reason'],
        rows: rows.map((l) => [l.startDate, l.endDate, l.leaveTypeName, l.daysCount, l.isPaid ? 'Yes' : 'No', statusText(l.status), l.reason]),
        totals: ['Total', '', '', rows.reduce((n, l) => n + l.daysCount, 0)],
      })}
    />
  );
}

const GIFT_LABEL: Record<GiftView['status'], string> = { REQUESTED: 'Asked for', PENDING: 'To give', DONE: 'Given', REJECTED: 'Turned down' };
function GiftsReport({ month }: Props) {
  const me = useSessionUser();
  const gifts = useCachedFetch<GiftView[]>('rep-gifts', () => listGifts(false));
  const rows = (gifts.data ?? []).filter((g) => inMonth(g.completedAt ?? g.allocatedAt, month)).sort((a, b) => (b.completedAt ?? b.allocatedAt).localeCompare(a.completedAt ?? a.allocatedAt));
  return (
    <ReportList
      title="Gifts"
      rows={rows}
      state={gifts}
      hasData={gifts.data !== null}
      empty="No gifts this month."
      render={(g) => (
        <ReportRow key={g.id} title={g.doctorName} subtitle={g.productName} value={g.amountPaise ? formatRupees(g.amountPaise) : null} pill={{ text: GIFT_LABEL[g.status], accent: STATUS_ACCENT[g.status] ?? 'slate' }} />
      )}
      fileName={fileOf('GIFTS', month, me?.name)}
      sheet={() => ({
        sheet: `Gifts ${month}`,
        title: `${me?.name ?? ''} · Gifts · ${prettyMonth(month)}`,
        header: ['Date', 'Doctor', 'Gift', 'Value (₹)', 'Status'],
        rows: rows.map((g) => [(g.completedAt ?? g.allocatedAt).slice(0, 10), g.doctorName, g.productName, rupees(g.amountPaise), GIFT_LABEL[g.status]]),
        totals: ['Total', '', '', rupees(rows.reduce((n, g) => n + g.amountPaise, 0)), ''],
      })}
    />
  );
}

function ServicesReport({ month }: Props) {
  const me = useSessionUser();
  const services = useCachedFetch<ServiceView[]>('rep-services', listMyServices);
  const rows = (services.data ?? []).filter((s) => inMonth(s.createdAt ?? s.doneAt, month));
  return (
    <ReportList
      title="Doctor services"
      rows={rows}
      state={services}
      hasData={services.data !== null}
      empty="No doctor services asked for this month."
      render={(s) => {
        const stage = serviceStage(s);
        return <ReportRow key={s.id} title={s.doctorName ?? 'Doctor'} subtitle={SERVICE_TYPE_LABEL[s.serviceType] ?? s.serviceType} value={formatRupees(s.amountPaise)} pill={{ text: stage.text, accent: stage.accent }} />;
      }}
      fileName={fileOf('DOCTOR SERVICES', month, me?.name)}
      sheet={() => ({
        sheet: `Services ${month}`,
        title: `${me?.name ?? ''} · Doctor services · ${prettyMonth(month)}`,
        header: ['Date', 'Doctor', 'Service', 'Amount (₹)', 'Status', 'Remarks'],
        rows: rows.map((s) => [(s.createdAt ?? '').slice(0, 10), s.doctorName ?? '', SERVICE_TYPE_LABEL[s.serviceType] ?? s.serviceType, rupees(s.amountPaise), serviceStage(s).text, s.remarks ?? '']),
        totals: ['Total', '', '', rupees(rows.reduce((n, s) => n + s.amountPaise, 0)), '', ''],
      })}
    />
  );
}

const SAMPLE_LABEL: Record<string, string> = { REQUESTED: 'Waiting', DONE: 'Done', CANCELLED: 'Cancelled' };
function SamplesReport({ month }: Props) {
  const me = useSessionUser();
  const requests = useCachedFetch<SampleRequestView[]>('rep-samples', listMySampleRequests);
  const rows = (requests.data ?? []).filter((r) => inMonth(r.requestedAt, month)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return (
    <ReportList
      title="Sample & LBL requests"
      rows={rows}
      state={requests}
      hasData={requests.data !== null}
      empty="No sample or LBL requests this month."
      render={(r) => (
        <ReportRow
          key={r.id}
          title={`${r.kind === 'LBL' ? 'LBL' : 'Samples'} · ${prettyDay(r.requestedAt.slice(0, 10))}`}
          subtitle={r.lines.map((l) => `${l.productName} × ${l.quantity}`).join(', ')}
          pill={{ text: SAMPLE_LABEL[r.status] ?? r.status, accent: r.status === 'DONE' ? 'green' : r.status === 'CANCELLED' ? 'slate' : 'amber' }}
        />
      )}
      fileName={fileOf('SAMPLE REQUESTS', month, me?.name)}
      sheet={() => ({
        sheet: `Requests ${month}`,
        title: `${me?.name ?? ''} · Sample & LBL requests · ${prettyMonth(month)}`,
        header: ['Date', 'Kind', 'Product', 'Asked', 'Credited', 'Status'],
        rows: rows.flatMap((r) => r.lines.map((l) => [r.requestedAt.slice(0, 10), r.kind === 'LBL' ? 'LBL' : 'Sample', l.productName, l.quantity, l.creditedQuantity, SAMPLE_LABEL[r.status] ?? r.status])),
      })}
    />
  );
}

const STAGE: Record<VisitStage, { text: string; accent: 'green' | 'amber' | 'red' }> = { COMPLETE: { text: 'Done', accent: 'green' }, IN_PROGRESS: { text: 'In progress', accent: 'amber' }, NOT_STARTED: { text: 'Not called', accent: 'red' } };
const URGENCY: Record<VisitStage, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETE: 2 };
function VisitsReport({ month, year }: Props) {
  const me = useSessionUser();
  const report = useCachedFetch<DoctorVisitsReport>(`doctor-visits:${year}:${month}`, () => getDoctorVisits(month));
  const mine = report.data?.mrs.find((m) => m.mr.id === me?.id) ?? null;
  const rows = [...(mine?.rows ?? [])].sort((a, b) => URGENCY[stageOf(a)] - URGENCY[stageOf(b)] || b.missed - a.missed || a.doctor.name.localeCompare(b.doctor.name));
  return (
    <ReportList
      title="Doctors"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={mine ? [{ label: 'Made', value: `${mine.made}/${mine.quota}`, accent: 'blue' }, { label: 'Not called', value: rows.filter((r) => stageOf(r) === 'NOT_STARTED').length, accent: 'red' }, { label: 'Done', value: `${mine.completedDoctors}/${mine.doctors}`, accent: 'green' }] : undefined}
      empty="No doctor has a visit target."
      render={(r) => <ReportRow key={r.doctor.id} title={r.doctor.name} subtitle={`${r.doctor.specialty} · ${r.made} of ${r.frequency} made`} value={r.missed > 0 ? `${r.missed} left` : null} pill={STAGE[stageOf(r)]} />}
      fileName={fileOf('DOCTOR VISITS', month, me?.name)}
      sheet={() => ({
        sheet: `Visits ${month}`,
        title: `${me?.name ?? ''} · Doctor visits · ${prettyMonth(month)}`,
        header: ['Doctor', 'Speciality', 'Target', 'Made', 'Remaining', 'Stage'],
        rows: rows.map((r) => [r.doctor.name, r.doctor.specialty, r.frequency, r.made, r.missed, STAGE[stageOf(r)].text]),
        totals: ['Total', '', rows.reduce((n, r) => n + r.frequency, 0), rows.reduce((n, r) => n + r.made, 0), rows.reduce((n, r) => n + r.missed, 0), ''],
      })}
    />
  );
}

function TargetsReport({ month, year }: Props) {
  const me = useSessionUser();
  const report = useCachedFetch<EmployeeSalesReport>(`rep-targets:${year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month));
  const t = report.data?.totals;
  const rows = report.data?.targets ?? [];
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
  return (
    <ReportList
      title="Targets"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={t ? [{ label: 'Target', value: formatRupees(t.targetPaise), accent: 'blue' }, { label: 'Achieved', value: formatRupees(t.secondaryPaise), accent: 'green' }, { label: 'Achievement', value: pct(t.achievementPercent), accent: (t.achievementPercent ?? 0) >= 100 ? 'green' : 'amber' }] : undefined}
      note={
        rows.some((r) => r.targetQty !== null) ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`In units: target ${rows.reduce((n, r) => n + (r.targetQty ?? 0), 0)} · achieved ${rows.reduce((n, r) => n + r.achievedQty, 0)}`}
          </ThemedText>
        ) : null
      }
      empty="No target is set for this month."
      render={(r) => (
        <ReportRow
          key={r.id}
          title={r.product?.name ?? 'All products'}
          subtitle={`Target ${formatRupees(r.amountPaise)}${r.targetQty !== null ? ` · ${r.targetQty} units` : ''} — achieved ${formatRupees(r.achievedPaise)} · ${r.achievedQty} units`}
          value={pct(r.achievementPercent)}
        />
      )}
      fileName={fileOf('TARGETS', month, me?.name)}
      sheet={() => ({
        sheet: `Targets ${month}`,
        title: `${me?.name ?? ''} · Targets · ${prettyMonth(month)}`,
        header: ['Product', 'Target (₹)', 'Achieved (₹)', 'Achievement %', 'Target units', 'Units achieved'],
        rows: rows.map((r) => [r.product?.name ?? 'All products', rupees(r.amountPaise), rupees(r.achievedPaise), r.achievementPercent, r.targetQty, r.achievedQty]),
        totals: t ? ['Total', rupees(t.targetPaise), rupees(t.secondaryPaise), t.achievementPercent, null, null] : undefined,
      })}
    />
  );
}

function SecondaryReport({ month, year }: Props) {
  const me = useSessionUser();
  const fy = useFinancialYear();
  const counts = useCachedFetch<StockCountsMonth>(`rep-secondary:${year}:${month}`, () => getStockCounts(me?.id ?? '', month));
  const rows = (counts.data?.distributors ?? []).filter((d) => d.totals.issuedQty > 0 || d.totals.openingQty > 0 || d.totals.primaryQty > 0);
  const t = counts.data?.totals;
  return (
    <ReportList
      title="Distributors"
      rows={rows}
      state={counts}
      hasData={counts.data !== null}
      tiles={t && counts.data ? [{ label: 'Value', value: formatRupees(t.issuedAmountPaise), accent: 'green' }, { label: 'Units', value: t.issuedQty, accent: 'blue' }, { label: 'Status', value: STOCK_COUNT_STATUS_TEXT[counts.data.status], accent: STOCK_COUNT_STATUS_ACCENT[counts.data.status] }] : undefined}
      empty="No secondary entered this month."
      render={(d) => (
        <ReportRow key={d.distributorId} title={d.name} subtitle={`Opening ${d.totals.openingQty} · Primary ${d.totals.primaryQty} · Secondary ${d.totals.issuedQty} · Closing ${d.totals.closingQty}`} value={formatRupees(d.totals.issuedAmountPaise)} pill={{ text: STOCK_COUNT_STATUS_TEXT[d.status], accent: STOCK_COUNT_STATUS_ACCENT[d.status] }} onPress={() => router.push({ pathname: '/report/secondary-distributor', params: { month, distributorId: d.distributorId } } as unknown as Href)} />
      )}
      // The Excel is Admin's Secondary sales sheet for the year (2026-11-28), not just these rows.
      download={me ? () => downloadSecondarySheet({ id: me.id, name: me.name ?? 'Me' }, fy.year, fy.label.replace(/^FY /, '')) : undefined}
    />
  );
}

const REPORTS: Record<Kind, (p: Props) => React.JSX.Element> = {
  orders: OrdersReport,
  leave: LeaveReport,
  gifts: GiftsReport,
  services: ServicesReport,
  samples: SamplesReport,
  visits: VisitsReport,
  targets: TargetsReport,
  secondary: SecondaryReport,
};

export default function OwnReportScreen() {
  const params = useLocalSearchParams<{ kind: string; month?: string }>();
  const fy = useFinancialYear();
  const kind = (params.kind in REPORTS ? params.kind : 'orders') as Kind;
  const last = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > last ? last : m);
  const [picked, setPicked] = useState<string | null>(params.month ?? null);
  const month = clamp(picked ?? last);
  const Report = REPORTS[kind];
  return (
    <ScreenShell title={TITLES[kind].title} subtitle={TITLES[kind].subtitle}>
      <FyBanner />
      <InfoCard>
        <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={last} />
      </InfoCard>
      {params.kind in REPORTS ? <Report month={month} year={fy.year} /> : <Notice tone="danger">That report doesn’t exist.</Notice>}
    </ScreenShell>
  );
}
