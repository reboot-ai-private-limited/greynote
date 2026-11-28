import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  getDailyPlanRecord,
  getChemistReview,
  getDoctorRecord,
  getDoctorServiceRecord,
  getLeaveRecord,
  listInbox,
  listMine,
  listTeam,
  type ApprovalDetail,
  type ApprovalItem,
  workWithText,
  type PlanDayView,
} from '@/lib/approvals';
import { getStatementById } from '@/lib/expense-months';
import { formatRupees } from '@/lib/money';
import { getMonthlyPlanById, isFieldDay, routeNamesText, workingTypeLabel, type NamedRoute } from '@/lib/planning';
import { useSessionUser } from '@/lib/session';
import { getSecondaryRollup, getStockCounts } from '@/lib/stock-counts';
import { useCachedSource } from '@/offline/cache';
import { useColleagues } from '@/offline/colleagues';
import { formatWhen, nowMs, prettyDay, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

import { DcrSummary } from './dcr-review';
import { DoctorAvatar } from './doctor-avatar';
import { Notice } from './notice';
import { PlanAmendments } from './plan-amendments';
import { PrimaryButton } from './primary-button';
import { SkeletonLines } from './skeleton';
import { StockCountCorrect } from './stock-count-correct';
import { StockCountsCard } from './stock-counts-card';
import { TeamReportFigures } from './team-report-card';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/** Loads the record a request is about. `reloadKey` re-fetches (after accepting a call, for instance). */
function useRecord<T>(load: () => Promise<T>, reloadKey: number) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    load()
      .then((data) => alive && setState({ data, error: null }))
      .catch((err) => alive && setState((s) => ({ ...s, error: errorText(err) })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);
  return state;
}

function Frame({ title, error, loading, children }: { title: string; error: string | null; loading: boolean; children?: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.frame}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !error ? (
        <SkeletonLines />
      ) : null}
      {children}
    </ThemedView>
  );
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.line}>
    <ThemedText type="small" themeColor="textSecondary" style={styles.lineLabel}>
      {label}
    </ThemedText>
    <ThemedText type="small" style={styles.lineValue}>
      {value}
    </ThemedText>
  </View>
);

/* ───────────────────────────── plans ───────────────────────────── */

function dayLines(day: PlanDayView, routes?: NamedRoute[]) {
  return (
    <>
      <Line label="Working type" value={workingTypeLabel(day.workingType)} />
      <Line label="Routes" value={routeNamesText(day.routeIds, routes)} />
      <Line label="Works with" value={workWithText(day)} />
      {day.remarks ? <Line label="Remarks" value={day.remarks} /> : null}
    </>
  );
}

function DailyPlanSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getDailyPlanRecord(recordId), 0);
  return (
    <Frame title={data ? `Daily plan · ${prettyDay(data.planDate)}` : 'Daily plan'} error={error} loading={!data}>
      {data ? (
        <>
          {dayLines(data, data.routes)}
          {isFieldDay(data.workingType) && data.doctors ? (
            data.doctors.some((d) => d.plannedBy) ? (
              // A manager's day (2026-11-28): the doctors are the ones the people they work with planned, shown by person.
              <>
                <Line label="Doctors to call" value={`${data.doctors.length} · from the people they work with`} />
                {Object.values(
                  data.doctors.reduce<Record<string, { who: string; names: string[] }>>((acc, d) => {
                    const key = d.plannedBy?.id ?? '-';
                    (acc[key] ??= { who: d.plannedBy?.label ?? 'Others', names: [] }).names.push(d.name ?? 'Doctor');
                    return acc;
                  }, {}),
                ).map((g) => (
                  <ThemedText key={g.who} type="small">
                    <ThemedText type="smallBold">{`${g.who}: `}</ThemedText>
                    {g.names.join(', ')}
                  </ThemedText>
                ))}
              </>
            ) : (
              <>
                <Line
                  label="Doctors to call"
                  value={
                    data.doctors.length === 0
                      ? data.workWith.length > 0
                        ? 'The people they work with planned no doctors yet'
                        : 'No doctors were chosen for this plan'
                      : `${data.doctors.length} doctor${data.doctors.length === 1 ? '' : 's'}${
                          data.doctors.some((d) => d.carriedFrom) ? ` (${data.doctors.filter((d) => d.carriedFrom).length} missed earlier)` : ''
                        }`
                  }
                />
                {data.doctors.map((d, i) => (
                  <ThemedText key={d.doctorId} type="small">
                    {`${i + 1}. ${d.name ?? 'Doctor'}${d.carriedFrom ? ` — missed since ${prettyDay(d.carriedFrom)}` : ''}`}
                  </ThemedText>
                ))}
              </>
            )
          ) : null}
          {data.source === 'MONTHLY' ?<ThemedText type="small" themeColor="textSecondary">From the approved Tour Plan.</ThemedText> : null}
        </>
      ) : null}
    </Frame>
  );
}

function MonthlyPlanSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getMonthlyPlanById(recordId), 0);
  const me = useSessionUser();
  const { colleagues } = useColleagues();
  const config = useCachedSource<ConfigSnapshot>('config');
  const nameOf = (userId: string) => (userId === me?.id ? 'You' : (colleagues.find((c) => c.id === userId)?.name ?? null));
  return (
    <Frame title={data ? `Tour plan · ${prettyMonth(data.planMonth)}` : 'Tour plan'} error={error} loading={!data}>
      {data?.amendments && data.amendments.length > 0 ? (
        <PlanAmendments amendments={data.amendments} entries={data.entries} routes={data.routes} nameOf={nameOf} timeZone={config.data?.settings.BUSINESS_TIMEZONE} />
      ) : null}
      {data?.entries.map((e, i) => (
        <View key={e.planDate} style={[styles.day, i > 0 && { borderTopWidth: 1, borderTopColor: '#B4B8C0' }]}>
          <ThemedText type="smallBold">{prettyDay(e.planDate)}</ThemedText>
          {dayLines(e, data.routes)}
        </View>
      ))}
    </Frame>
  );
}

/* ───────────────────────────── leave, doctor, service ───────────────────────────── */

function LeaveSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getLeaveRecord(recordId), 0);
  return (
    <Frame title={data ? `Leave · ${data.leaveTypeName}` : 'Leave'} error={error} loading={!data}>
      {data ? (
        <>
          <Line label="Dates" value={data.startDate === data.endDate ? prettyDay(data.startDate) : `${prettyDay(data.startDate)} → ${prettyDay(data.endDate)}`} />
          <Line label="Days counted" value={String(data.daysCount)} />
          <Line label="Paid" value={data.isPaid ? 'Yes' : 'No (loss of pay)'} />
          {data.reason ? <Line label="Reason" value={data.reason} /> : null}
          {data.attachments.length > 0 ? (
            <View style={styles.entry}>
              <ThemedText type="smallBold">Proof</ThemedText>
              {data.attachments.map((a) => (
                <PrimaryButton key={a.id} label={a.fileName} variant="text" onPress={() => void Linking.openURL(a.url)} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
}

/** A date of record ("1980-05-12") as "12 May 1980". */
const dateOfRecord = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : null;

/** Where the phone was, with a link to a map, or that it wasn't captured. */
function WhereLine({ where }: { where: { latitude: number; longitude: number } | null }) {
  return (
    <>
      <Line label="Location" value={where ? `${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)} (where the phone was)` : 'Not captured'} />
      {where ? (
        <PrimaryButton label="Open in Maps" variant="text" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${where.latitude},${where.longitude}`)} />
      ) : null}
    </>
  );
}

/** A heading inside a preview, matching the form's sections. */
const Heading = ({ text }: { text: string }) => (
  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.heading}>
    {text}
  </ThemedText>
);

/** A new doctor waiting for a decision (2026-11-28): exactly what the form asked, in its order — where, the doctor, the location, who sent it. */
function NewDoctorSummary({ request, canCorrect }: { request: ApprovalDetail; canCorrect: boolean }) {
  const recordId = request.recordId;
  const { data, error } = useRecord(() => getDoctorRecord(recordId), 0);
  const where = data?.capturedLocation ?? data?.location ?? null;
  const who = request.submitter ? `${request.submitter.name} (${request.submitter.employeeCode})` : null;
  return (
    <Frame title="New doctor" error={error} loading={!data}>
      {data ? (
        <>
          <Heading text="Where" />
          <Line label="Place" value={data.placeName ?? '—'} />
          <Line label="Area (road name)" value={data.address || '—'} />
          <Heading text="Doctor" />
          <DoctorAvatar name={data.name} photoUrl={data.photoUrl} size={64} />
          <Line label="Name" value={data.name} />
          <Line label="Speciality" value={data.specialty} />
          <Line label="Qualification" value={data.qualification} />
          <Line label="Clinic" value={data.clinicName || '—'} />
          <Line label="Phone" value={data.phone || '—'} />
          <Line label="Email" value={data.email || '—'} />
          <Line label="Date of birth" value={dateOfRecord(data.dateOfBirth) ?? '—'} />
          <Line label="Anniversary" value={dateOfRecord(data.anniversary) ?? '—'} />
          <Line label="Visits a month" value={data.visitFrequency ? String(data.visitFrequency) : '—'} />
          <Heading text="Location" />
          <WhereLine where={where} />
          <Heading text="Sent" />
          {who ? <Line label="Added by" value={who} /> : null}
          <Line label="Sent" value={formatWhen(request.submittedAt)} />
          {canCorrect && data.status === 'pending' ? (
            <PrimaryButton label="Correct details or location" variant="text" onPress={() => router.push({ pathname: '/review-doctor', params: { id: recordId, who: request.submitter?.name ?? '' } })} />
          ) : null}
        </>
      ) : null}
    </Frame>
  );
}

/**
 * A new chemist waiting for a decision: name, HQ · Route, address, phone, who added it and the location the phone captured, with Open in Maps,
 * like the doctor review. A manager reads it through `GET /chemists/:id/review` (added by, or held by, someone below them).
 */
function NewChemistSummary({ request }: { request: ApprovalDetail }) {
  const { data, error } = useRecord(() => getChemistReview(request.recordId), 0);
  // The server names the chemist on the list rows but not on the single request, so look it up on the lists when it is missing.
  const [found, setFound] = useState<ApprovalItem['subject']>(null);
  useEffect(() => {
    if (request.subject) return;
    let alive = true;
    (async () => {
      for (const load of [() => listInbox(100, { kind: 'NEW_CHEMIST' }), () => listTeam('all', 100, { kind: 'NEW_CHEMIST' }), () => listMine(100)]) {
        try {
          const row = (await load()).items.find((i) => i.id === request.id);
          if (row?.subject) return void (alive && setFound(row.subject));
        } catch {
          /* try the next list */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [request.id, request.subject]);
  const subject = request.subject ?? found;
  const who = request.submitter ? `${request.submitter.name} (${request.submitter.employeeCode})` : null;
  const where = data?.capturedLocation ?? data?.location ?? null;
  return (
    <Frame title="New chemist" error={null} loading={false}>
      <Heading text="Where" />
      <Line label="Place" value={data?.placeName ?? subject?.subtitle ?? '—'} />
      <Line label="Area (road name)" value={data?.address || '—'} />
      <Heading text="Chemist" />
      <Line label="Name" value={data?.name ?? subject?.title ?? '—'} />
      <Line label="Phone" value={data?.phone || '—'} />
      {data ? (
        <>
          <Heading text="Location" />
          <WhereLine where={where} />
        </>
      ) : error ? (
        <Notice tone="info">The address and location couldn’t be loaded here. To check them on a map before deciding, open this request in the web portal.</Notice>
      ) : null}
      <Heading text="Sent" />
      {who ? <Line label="Added by" value={who} /> : null}
      <Line label="Sent" value={formatWhen(request.submittedAt)} />
    </Frame>
  );
}

function DoctorServiceSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getDoctorServiceRecord(recordId), 0);
  return (
    <Frame title="Doctor service" error={error} loading={!data}>
      {data ? (
        <>
          <Line label="Doctor" value={data.doctorName} />
          {data.userName ? <Line label="Asked by" value={data.userName} /> : null}
          <Line label="Service" value={data.serviceType.replace(/_/g, ' ').toLowerCase()} />
          <Line label="Amount" value={formatRupees(data.amountPaise)} />
          {data.remarks ? <Line label="Remarks" value={data.remarks} /> : null}
        </>
      ) : null}
    </Frame>
  );
}

/* ───────────────────────────── secondary sales ───────────────────────────── */

/** A secondary-sales request's record id is `mrUserId:YYYY-MM` (an MR's month). Approving it is what makes the figures feed achievement. */
function StockCountSummary({ recordId, who }: { recordId: string; who?: string }) {
  const cut = recordId.lastIndexOf(':');
  const month = recordId.slice(cut + 1);
  const userId = recordId.slice(0, cut);
  const me = useSessionUser();
  const [tick, setTick] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  const { data, error } = useRecord(() => getStockCounts(userId, month), tick);
  // A manager (not the MR) may correct what is still waiting, with a reason, before deciding (backend: PATCH /sales/secondary-stock).
  const canCorrect = data !== null && me?.id !== userId && data.distributors.some((d) => d.status === 'PENDING');
  return (
    <Frame title={`Distributor stock counts · ${prettyMonth(month)}`} error={error} loading={!data}>
      {who ? <Line label="Employee" value={who} /> : null}
      {data && correcting ? (
        <StockCountCorrect
          data={data}
          onDone={(changed) => {
            setCorrecting(false);
            if (changed) setTick((n) => n + 1);
          }}
        />
      ) : data ? (
        <>
          <StockCountsCard data={data} />
          {canCorrect ? <PrimaryButton label="Correct figures" variant="text" onPress={() => setCorrecting(true)} /> : null}
        </>
      ) : null}
    </Frame>
  );
}

/** A manager's team report: record id `managerUserId:YYYY-MM:team`. Read-only; the upper manager decides it below. */
function TeamReportSummary({ recordId, who }: { recordId: string; who?: string }) {
  const [userId, month] = recordId.split(':');
  const { data, error } = useRecord(() => getSecondaryRollup(userId, month), 0);
  return (
    <Frame title={`Team secondary report · ${prettyMonth(month)}`} error={error} loading={!data}>
      {who ? <Line label="Manager" value={who} /> : null}
      {data ? (
        <>
          {data.designation?.name ? <Line label="Designation" value={data.designation.name} /> : null}
          {data.outOfDate ? <Notice tone="warning">An MR report changed after this was sent, so the figures may be out of date.</Notice> : null}
          <TeamReportFigures data={data} />
        </>
      ) : null}
    </Frame>
  );
}

/* ───────────────────────────── the daily report ───────────────────────────── */

/** A bordered white box that stands out on the grey card: one call, one followup, one table. */
/* ───────────────────────────── monthly expenses ───────────────────────────── */

function ExpenseMonthSummaryCard({ recordId }: { recordId: string }) {
  const timeZone = useCachedSource<ConfigSnapshot>('config').data?.settings.BUSINESS_TIMEZONE;
  const { data, error } = useRecord(() => getStatementById(recordId), 0);
  return (
    <Frame title={data ? `Expenses · ${prettyMonth(data.month)}` : 'Monthly expenses'} error={error} loading={!data}>
      {data ? (
        <>
          <Line label="TA" value={formatRupees(data.totals.taPaise)} />
          <Line label="DA" value={formatRupees(data.totals.daPaise)} />
          <Line label="Other" value={formatRupees(data.totals.otherPaise)} />
          <Line label="Total" value={formatRupees(data.totals.totalPaise)} />
          {data.deadlines ? <Line label="Approve by" value={formatWhen(data.deadlines.approveBy, timeZone)} /> : null}
          {data.deadlines && data.status === 'SUBMITTED' && !data.exceptions.approveUntil && Date.parse(data.deadlines.approveBy) < nowMs() ? (
            <Notice tone="warning">Approval deadline passed — ask Admin to allow it, or reject it.</Notice>
          ) : null}
          {data.exceptions?.approveUntil ? <Notice tone="info">{`Allowed until ${formatWhen(data.exceptions.approveUntil, timeZone)}.`}</Notice> : null}
          {data.days.map((d) => (
            <View key={d.date} style={styles.tableRow}>
              <View style={styles.tableMain}>
                <ThemedText type="small">{prettyDay(d.date)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`TA ${formatRupees(d.taPaise)} · DA ${formatRupees(d.daPaise)} · Other ${formatRupees(d.otherPaise)}`}</ThemedText>
                {d.others.filter((o) => o.remarks || (o.attachments ?? []).length > 0).map((o) => (
                  <View key={o.id}>
                    <ThemedText type="small" themeColor="textSecondary">{`${formatRupees(o.amountPaise)}${o.remarks ? ` · ${o.remarks}` : ''}`}</ThemedText>
                    {(o.attachments ?? []).map((a) => (
                      <PrimaryButton key={a.id} label={`Receipt: ${a.fileName}`} variant="text" onPress={() => void Linking.openURL(a.url)} />
                    ))}
                  </View>
                ))}
              </View>
              <ThemedText type="small" style={styles.amount}>
                {formatRupees(d.totalPaise)}
              </ThemedText>
            </View>
          ))}
        </>
      ) : null}
    </Frame>
  );
}

/* ───────────────────────────── entry point ───────────────────────────── */

export { DcrSummary };

/**
 * The record behind a request, shown by kind. `aside` is the request's history: a daily report puts it beside the expenses on a
 * tablet; every other kind shows it under the record. An unknown kind still shows the history.
 */
export function ApprovalSummary({ request, aside }: { request: ApprovalDetail; aside?: React.ReactNode }) {
  if (request.kind === 'DCR') return <DcrSummary recordId={request.recordId} canAct={request.canAct} aside={aside} submitterId={request.submitter?.id} />;
  let record: React.ReactNode;
  switch (request.kind) {
    case 'DAILY_PLAN':
      record = <DailyPlanSummary recordId={request.recordId} />;
      break;
    case 'MONTHLY_PLAN':
      record = <MonthlyPlanSummary recordId={request.recordId} />;
      break;
    case 'LEAVE':
      record = <LeaveSummary recordId={request.recordId} />;
      break;
    case 'NEW_DOCTOR':
      record = <NewDoctorSummary request={request} canCorrect={request.canAct} />;
      break;
    case 'NEW_CHEMIST':
      record = <NewChemistSummary request={request} />;
      break;
    case 'DOCTOR_SERVICE':
      record = <DoctorServiceSummary recordId={request.recordId} />;
      break;
    case 'EXPENSE_MONTH':
      record = <ExpenseMonthSummaryCard recordId={request.recordId} />;
      break;
    case 'SECONDARY_SALES':
      // `managerUserId:month:team` is a manager's team report (read-only for the upper manager); `mrUserId:month` is an MR's month.
      record = request.recordId.endsWith(':team') ? (
        <TeamReportSummary recordId={request.recordId} who={request.submitter?.name} />
      ) : (
        <StockCountSummary recordId={request.recordId} who={request.submitter?.name} />
      );
      break;
    default:
      record = <Notice tone="info">No preview for this kind of request. Its history is below.</Notice>;
  }
  // Plans, leave, services and monthly expenses show no sender of their own: say who sent it and when, so the manager decides with the whole picture.
  const sender = ['DAILY_PLAN', 'MONTHLY_PLAN', 'LEAVE', 'DOCTOR_SERVICE', 'EXPENSE_MONTH'].includes(request.kind) && request.submitter ? request.submitter : null;
  return (
    <View style={styles.stack}>
      {sender ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`Sent by ${sender.name} (${sender.employeeCode}) · ${formatWhen(request.submittedAt)}`}
        </ThemedText>
      ) : null}
      {record}
      {aside}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  frame: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  line: { flexDirection: 'row', gap: Spacing.two },
  lineLabel: { width: 120 },
  heading: { marginTop: Spacing.two, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  lineValue: { flex: 1 },
  entry: { gap: Spacing.one, paddingTop: Spacing.two },
  day: { gap: Spacing.one, paddingTop: Spacing.two },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  tableMain: { flex: 1, gap: Spacing.half },
  amount: { textAlign: 'right' },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9A9EA6', paddingTop: Spacing.two },
});
