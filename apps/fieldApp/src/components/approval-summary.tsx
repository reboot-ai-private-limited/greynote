import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  acceptCall,
  getDailyPlanRecord,
  getDcr,
  getDoctorRecord,
  getDoctorServiceRecord,
  getLeaveRecord,
  getMonthlyPlanRecord,
  getPlanChangeRecord,
  type ApprovalDetail,
  type DcrDetail,
  type DcrChemistCall,
  type DcrDoctorCall,
  type GeofenceOutcome,
  type PlanDayView,
} from '@/lib/approvals';
import { getStatementById } from '@/lib/expense-months';
import { formatRupees } from '@/lib/money';
import { useTheme } from '@/hooks/use-theme';
import { workingTypeLabel, type WorkingType } from '@/lib/planning';
import { formatWhen, prettyDay, prettyMonth } from '@/offline/day';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { SkeletonLines } from './skeleton';
import { TextField } from './text-field';
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
      <Line label="Working type" value={workingTypeLabel(day.workingType as WorkingType)} />
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
          {data.workingType === 'FIELD_WORK' && data.doctors ? (
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

function PlanChangeSummary({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getPlanChangeRecord(recordId), 0);
  return (
    <Frame title={data ? `Plan change · ${prettyDay(data.planDate)}` : 'Plan change'} error={error} loading={!data}>
      {data ? (
        <>
          <Line label="Why" value={data.reason} />
          <Section title="Was">
            <Box>{dayLines(data.previous)}</Box>
          </Section>
          <Section title="Changes to">
            <Box>{dayLines(data.proposed)}</Box>
          </Section>
        </>
      ) : null}
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
          {data.email ? <Line label="Email" value={data.email} /> : null}
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

const EXPENSE_LABEL: Record<string, string> = { TA: 'Travel allowance (TA)', DA: 'Daily allowance (DA)', TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other' };

const GEO_TEXT = { PASS: 'Location matched', FAIL: 'Away from the registered location', UNVERIFIED: 'Location not verified' } as const;

function geofenceText(g: GeofenceOutcome): { text: string; tone: 'primary' | 'danger' | 'warning' } {
  if (g.overriddenAt) return { text: `Accepted by the manager${g.overrideComment ? `: “${g.overrideComment}”` : ''}`, tone: 'primary' };
  const distance = g.distanceMeters !== null ? ` · ${g.distanceMeters >= 1000 ? `${(g.distanceMeters / 1000).toFixed(1)} km` : `${g.distanceMeters} m`}` : '';
  return { text: `${GEO_TEXT[g.status]}${distance}`, tone: g.status === 'PASS' ? 'primary' : g.status === 'FAIL' ? 'danger' : 'warning' };
}

/** A bordered white box that stands out on the grey card: one call, one followup, one table. */
function Box({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.box, { backgroundColor: theme.background, borderColor: theme.border }]}>{children}</View>;
}

/** A section heading with how many things are in it. */
function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{count === undefined ? title : `${title} · ${count}`}</ThemedText>
      {children}
    </View>
  );
}

/** One number with its label, for the strip at the top of a report. */
function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="smallBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

function CallCard({
  name,
  call,
  samples,
  canAccept,
  onAccept,
}: {
  name: string;
  call: DcrDoctorCall | DcrChemistCall;
  samples?: string;
  canAccept: boolean;
  onAccept: (callId: string, comment: string) => Promise<string | null>;
}) {
  const geo = geofenceText(call.geofence);
  const flagged = call.geofence.status !== 'PASS' && !call.geofence.overriddenAt;
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    if (!comment.trim()) return setProblem('Give a reason for accepting this call.');
    setBusy(true);
    setProblem(await onAccept(call.id, comment));
    setBusy(false);
  };

  return (
    <Box>
      <View style={styles.boxHead}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ThemedText type="smallBold" style={styles.boxTitle}>
            {name}
          </ThemedText>
          {'notInPlan' in call && call.notInPlan ? (
            <ThemedText type="small" themeColor="warning">
              (Not in plan)
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {formatWhen(call.recordedAt)}
        </ThemedText>
      </View>
      <Line label="Working type" value={workingTypeLabel(call.workingType as WorkingType)} />
      <View style={styles.line}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lineLabel}>
          Location
        </ThemedText>
        <ThemedText type="small" themeColor={geo.tone} style={styles.lineValue}>
          {geo.text}
        </ThemedText>
      </View>
      {call.accuracyMeters !== null ? <Line label="GPS accuracy" value={`± ${Math.round(call.accuracyMeters)} m`} /> : null}
      {samples ? <Line label="Samples" value={samples} /> : null}
      {call.remarks ? <Line label="Remarks" value={call.remarks} /> : null}
      {flagged && canAccept ? (
        open ? (
          <View style={styles.accept}>
            <TextField
              label="Why are you accepting it?"
              value={comment}
              onChangeText={(t) => {
                setComment(t);
                setProblem(null);
              }}
              multiline
              maxLength={500}
              editable={!busy}
            />
            {problem ? <Notice tone="danger">{problem}</Notice> : null}
            <PrimaryButton label="Accept this call" loading={busy} onPress={submit} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setOpen(false)} />
          </View>
        ) : (
          <PrimaryButton label="Accept this call" variant="text" onPress={() => setOpen(true)} />
        )
      ) : null}
    </Box>
  );
}

export function DcrSummary({ recordId, canAct }: { recordId: string; canAct: boolean }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error } = useRecord<DcrDetail>(() => getDcr(recordId), reloadKey);

  const accept = async (callId: string, comment: string): Promise<string | null> => {
    try {
      await acceptCall(recordId, callId, comment);
      setReloadKey((k) => k + 1);
      return null;
    } catch (err) {
      return errorText(err);
    }
  };

  const flagged = data ? [...data.doctorCalls, ...data.chemistCalls].filter((c) => c.geofence.status !== 'PASS' && !c.geofence.overriddenAt).length : 0;
  const unplanned = data ? data.doctorCalls.filter((c) => c.notInPlan).length : 0;
  const total = data?.expenses.reduce((sum, e) => sum + e.amountPaise, 0) ?? 0;

  return (
    <Frame title={data ? `Daily report · ${prettyDay(data.reportDate)}` : 'Daily report'} error={error} loading={!data}>
      {data ? (
        <>
          <View style={styles.stats}>
            <Stat label="Doctor calls" value={String(data.doctorCalls.length)} />
            <Stat label="Chemist calls" value={String(data.chemistCalls.length)} />
            <Stat label="Followups" value={String(data.followups.length)} />
            <Stat label="Expenses" value={formatRupees(total)} />
          </View>
          {flagged > 0 ? (
            <Notice tone="warning">{`${flagged} call${flagged === 1 ? ' was' : 's were'} flagged by the location check.${canAct ? ' Accepting a call is separate from approving the day.' : ''}`}</Notice>
          ) : null}
          {unplanned > 0 ? (
            <Notice tone="warning">{`${unplanned} doctor call${unplanned === 1 ? ' was' : 's were'} not in the day’s plan.`}</Notice>
          ) : null}

          {data.doctorCalls.length > 0 ? (
            <Section title="Doctor calls" count={data.doctorCalls.length}>
              {data.doctorCalls.map((c) => (
                <CallCard
                  key={c.id}
                  name={c.doctorName}
                  call={c}
                  samples={c.samples.length ? c.samples.map((s) => `${s.productName} × ${s.quantity}`).join(', ') : undefined}
                  canAccept={canAct}
                  onAccept={accept}
                />
              ))}
            </Section>
          ) : null}

          {data.chemistCalls.length > 0 ? (
            <Section title="Chemist calls" count={data.chemistCalls.length}>
              {data.chemistCalls.map((c) => (
                <CallCard key={c.id} name={c.chemistName} call={c} canAccept={canAct} onAccept={accept} />
              ))}
            </Section>
          ) : null}

          {data.followups.length > 0 ? (
            <Section title="Followups" count={data.followups.length}>
              {data.followups.map((f) => (
                <Box key={f.id}>
                  <View style={styles.boxHead}>
                    <ThemedText type="smallBold" style={styles.boxTitle}>
                      {f.subjectName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {f.subject === 'DOCTOR' ? 'Doctor' : 'Chemist'}
                    </ThemedText>
                  </View>
                  <ThemedText type="small">{f.remarks}</ThemedText>
                </Box>
              ))}
            </Section>
          ) : null}

          <Section title="Expenses">
            <Box>
              {data.expenses.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  None claimed. TA and DA are worked out when the report is approved.
                </ThemedText>
              ) : (
                <>
                  {data.expenses.map((e) => (
                    <View key={e.id} style={styles.tableRow}>
                      <View style={styles.tableMain}>
                        <ThemedText type="small">{`${EXPENSE_LABEL[e.type] ?? e.type}${e.source === 'AUTO' ? ' (worked out)' : ''}`}</ThemedText>
                        {e.remarks ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {e.remarks}
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText type="small" style={styles.amount}>
                        {formatRupees(e.amountPaise)}
                      </ThemedText>
                    </View>
                  ))}
                  <View style={[styles.tableRow, styles.totalRow]}>
                    <ThemedText type="smallBold" style={styles.tableMain}>
                      Total
                    </ThemedText>
                    <ThemedText type="smallBold" style={styles.amount}>
                      {formatRupees(total)}
                    </ThemedText>
                  </View>
                </>
              )}
            </Box>
          </Section>
        </>
      ) : null}
    </Frame>
  );
}

/* ───────────────────────────── monthly expenses ───────────────────────────── */

function ExpenseMonthSummaryCard({ recordId }: { recordId: string }) {
  const { data, error } = useRecord(() => getStatementById(recordId), 0);
  return (
    <Frame title={data ? `Expenses · ${prettyMonth(data.month)}` : 'Monthly expenses'} error={error} loading={!data}>
      {data ? (
        <>
          <Line label="TA" value={formatRupees(data.totals.taPaise)} />
          <Line label="DA" value={formatRupees(data.totals.daPaise)} />
          <Line label="Other" value={formatRupees(data.totals.otherPaise)} />
          <Line label="Total" value={formatRupees(data.totals.totalPaise)} />
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

/** The record behind a request, shown by kind. An unknown kind still shows the request's history below it. */
export function ApprovalSummary({ request }: { request: ApprovalDetail }) {
  switch (request.kind) {
    case 'DAILY_PLAN':
      return <DailyPlanSummary recordId={request.recordId} />;
    case 'MONTHLY_PLAN':
      return <MonthlyPlanSummary recordId={request.recordId} />;
    case 'DAILY_PLAN_CHANGE':
      return <PlanChangeSummary recordId={request.recordId} />;
    case 'DCR':
      return <DcrSummary recordId={request.recordId} canAct={request.canAct} />;
    case 'LEAVE':
      return <LeaveSummary recordId={request.recordId} />;
    case 'NEW_DOCTOR':
      return <NewDoctorSummary recordId={request.recordId} />;
    case 'DOCTOR_SERVICE':
      return <DoctorServiceSummary recordId={request.recordId} />;
    case 'EXPENSE_MONTH':
      return <ExpenseMonthSummaryCard recordId={request.recordId} />;
    default:
      return <Notice tone="info">No preview for this kind of request. Its history is below.</Notice>;
  }
}

const styles = StyleSheet.create({
  frame: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  line: { flexDirection: 'row', gap: Spacing.two },
  lineLabel: { width: 110 },
  lineValue: { flex: 1 },
  entry: { gap: Spacing.one, paddingTop: Spacing.two },
  accept: { gap: Spacing.two },
  box: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.two },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  boxTitle: { flex: 1 },
  section: { gap: Spacing.two, paddingTop: Spacing.two },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.half },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  tableMain: { flex: 1, gap: Spacing.half },
  amount: { textAlign: 'right' },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9A9EA6', paddingTop: Spacing.two },
});
