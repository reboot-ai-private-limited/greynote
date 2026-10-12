import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  getDailyPlanRecord,
  getDoctorRecord,
  getDoctorServiceRecord,
  getLeaveRecord,
  getMonthlyPlanRecord,
  type ApprovalDetail,
  type PlanDayView,
} from '@/lib/approvals';
import { getStatementById } from '@/lib/expense-months';
import { formatRupees } from '@/lib/money';
import { useDayGate } from '@/hooks/use-day-gate';
import { useTheme } from '@/hooks/use-theme';
import { isFieldDay, workingTypeLabel } from '@/lib/planning';
import { useCachedSource } from '@/offline/cache';
import { formatWhen, nowMs, prettyDay, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

import { DcrSummary } from './dcr-review';
import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { SkeletonLines } from './skeleton';
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

function dayLines(day: PlanDayView) {
  return (
    <>
      <Line label="Working type" value={workingTypeLabel(day.workingType)} />
      <Line label="Routes" value={day.routeIds.length === 0 ? 'None' : `${day.routeIds.length} route${day.routeIds.length === 1 ? '' : 's'}`} />
      <Line label="Works with" value={day.workWith.length === 0 ? 'Nobody' : `${day.workWith.length} colleague${day.workWith.length === 1 ? '' : 's'}`} />
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
          {dayLines(data)}
          {isFieldDay(data.workingType) && data.doctors ? (
            <Line
              label="Doctors"
              value={
                data.doctors.length === 0
                  ? 'None chosen'
                  : `${data.doctors.length} doctor${data.doctors.length === 1 ? '' : 's'}${
                      data.doctors.some((d) => d.carriedFrom) ? ` (${data.doctors.filter((d) => d.carriedFrom).length} missed earlier)` : ''
                    }`
              }
            />
          ) : null}
          {data.source === 'MONTHLY' ?<ThemedText type="small" themeColor="textSecondary">From the approved Monthly Plan.</ThemedText> : null}
        </>
      ) : null}
    </Frame>
  );
}

function MonthlyPlanSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getMonthlyPlanRecord(recordId), 0);
  return (
    <Frame title={data ? `Monthly plan · ${prettyMonth(data.planMonth)}` : 'Monthly plan'} error={error} loading={!data}>
      {data?.entries.map((e) => (
        <Box key={e.planDate}>
          <ThemedText type="smallBold">{prettyDay(e.planDate)}</ThemedText>
          {dayLines(e)}
        </Box>
      ))}
    </Frame>
  );
}

/* ───────────────────────────── leave, doctor, service ───────────────────────────── */

function LeaveSummary({ recordId }: { recordId: string }) {
  const { today } = useDayGate();
  const { data, error } = useRecord(() => getLeaveRecord(recordId), 0);
  return (
    <Frame title={data ? `Leave · ${data.leaveTypeName}` : 'Leave'} error={error} loading={!data}>
      {data ? (
        <>
          <Line label="Dates" value={data.startDate === data.endDate ? prettyDay(data.startDate) : `${prettyDay(data.startDate)} → ${prettyDay(data.endDate)}`} />
          <Line label="Days counted" value={String(data.daysCount)} />
          <Line label="Paid" value={data.isPaid ? 'Yes' : 'No (loss of pay)'} />
          {data.startDate <= today && (data.status === 'SUBMITTED' || data.status === 'MANAGER_APPROVED') ? <Notice tone="warning">This leave has started, so it can only be rejected unless Admin allows a late approval.</Notice> : null}
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

function NewDoctorSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getDoctorRecord(recordId), 0);
  const where = data?.capturedLocation ?? data?.location ?? null;
  return (
    <Frame title="New doctor" error={error} loading={!data}>
      {data ? (
        <>
          <Line label="Name" value={data.name} />
          <Line label="Speciality" value={data.specialty} />
          <Line label="Qualification" value={data.qualification} />
          <Line label="Address" value={data.address} />
          {data.clinicName ? <Line label="Clinic" value={data.clinicName} /> : null}
          {data.phone ? <Line label="Phone" value={data.phone} /> : null}
          {data.email ? <Line label="Email" value={data.email} /> : null}
          {data.visitFrequency ? <Line label="Visits a month" value={String(data.visitFrequency)} /> : null}
          <Line label="Location" value={where ? `${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)} (where the phone was)` : 'Not captured'} />
          {where ? (
            <PrimaryButton
              label="Open in Maps"
              variant="text"
              onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${where.latitude},${where.longitude}`)}
            />
          ) : null}
        </>
      ) : null}
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
          <Line label="Service" value={data.serviceType.replace(/_/g, ' ').toLowerCase()} />
          <Line label="Amount" value={formatRupees(data.amountPaise)} />
          {data.remarks ? <Line label="Remarks" value={data.remarks} /> : null}
        </>
      ) : null}
    </Frame>
  );
}

/* ───────────────────────────── the daily report ───────────────────────────── */

/** A bordered white box that stands out on the grey card: one call, one followup, one table. */
function Box({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.box, { backgroundColor: theme.background, borderColor: theme.border }]}>{children}</View>;
}

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
  if (request.kind === 'DCR') return <DcrSummary recordId={request.recordId} canAct={request.canAct} aside={aside} />;
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
      record = <NewDoctorSummary recordId={request.recordId} />;
      break;
    case 'DOCTOR_SERVICE':
      record = <DoctorServiceSummary recordId={request.recordId} />;
      break;
    case 'EXPENSE_MONTH':
      record = <ExpenseMonthSummaryCard recordId={request.recordId} />;
      break;
    default:
      record = <Notice tone="info">No preview for this kind of request. Its history is below.</Notice>;
  }
  return (
    <View style={styles.stack}>
      {record}
      {aside}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  frame: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  line: { flexDirection: 'row', gap: Spacing.two },
  lineLabel: { width: 110 },
  lineValue: { flex: 1 },
  entry: { gap: Spacing.one, paddingTop: Spacing.two },
  box: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.two },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  tableMain: { flex: 1, gap: Spacing.half },
  amount: { textAlign: 'right' },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9A9EA6', paddingTop: Spacing.two },
});
