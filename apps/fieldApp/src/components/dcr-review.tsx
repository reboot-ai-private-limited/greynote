import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { acceptCall, getDcr, type DcrChemistCall, type DcrDetail, type DcrDoctorCall, type GeofenceOutcome } from '@/lib/approvals';
import { formatRupees } from '@/lib/money';
import { routeTypeLabel, workingTypeLabel } from '@/lib/planning';
import { formatWhen, prettyDay } from '@/offline/day';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { SkeletonLines } from './skeleton';
import { TextField } from './text-field';
import { DoctorsToday } from './team/doctors-today';
import { ThemedText } from './themed-text';

const sym = (ios: string, android: string): SymbolViewProps['name'] => ({ ios, android, web: android }) as SymbolViewProps['name'];
const ICON = {
  doctor: sym('stethoscope', 'medical_services'),
  chemist: sym('cross.case', 'local_pharmacy'),
  followup: sym('text.bubble', 'chat'),
  money: sym('indianrupeesign.circle', 'payments'),
  travel: sym('car', 'directions_car'),
  meal: sym('fork.knife', 'restaurant'),
  other: sym('doc.text', 'receipt_long'),
  order: sym('cart', 'shopping_cart'),
  gift: sym('gift', 'redeem'),
  service: sym('person.2.wave.2', 'volunteer_activism'),
  sample: sym('shippingbox', 'inventory_2'),
};

/** A status word and colour for the day's other records (orders, gifts, services, sample/LBL requests). */
const STATUS: Record<string, { text: string; accent: Accent }> = {
  PLACED: { text: 'Placed', accent: 'amber' },
  DONE: { text: 'Done', accent: 'green' },
  CANCELLED: { text: 'Cancelled', accent: 'slate' },
  REQUESTED: { text: 'Requested', accent: 'amber' },
  PENDING: { text: 'Accepted', accent: 'blue' },
  REJECTED: { text: 'Rejected', accent: 'red' },
  SUBMITTED: { text: 'Waiting', accent: 'amber' },
  MANAGER_APPROVED: { text: 'Manager approved', accent: 'blue' },
  APPROVED: { text: 'Approved', accent: 'green' },
  WITHDRAWN: { text: 'Withdrawn', accent: 'slate' },
};
const statusOf = (s: string) => STATUS[s] ?? { text: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '), accent: 'slate' as Accent };
const serviceTitle = (t: string) => (t === 'CME' ? 'CME' : t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' '));

/** One record of the rest of the day: who/what, a detail line, an amount and a status. */
function ExtraRow({ name, title, detail, amount, status, accent }: { name: string; title: string; detail?: string | null; amount?: number; status?: string; accent: Accent }) {
  const theme = useTheme();
  return (
    <View style={[styles.call, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.callHead}>
        <Avatar name={name} accent={accent} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>{title}</ThemedText>
          {detail ? <ThemedText type="small" themeColor="textSecondary" style={styles.subtle}>{detail}</ThemedText> : null}
        </View>
        <View style={styles.extraRight}>
          {amount !== undefined && amount > 0 ? <ThemedText type="smallBold">{formatRupees(amount)}</ThemedText> : null}
          {status ? <Pill text={statusOf(status).text} accent={statusOf(status).accent} /> : null}
        </View>
      </View>
    </View>
  );
}

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const GEO_TEXT = { PASS: 'Location matched', FAIL: 'Away from the registered location', UNVERIFIED: 'Location not verified' } as const;

function geofenceText(g: GeofenceOutcome): { text: string; tone: 'ok' | 'bad' | 'warn' } {
  if (g.overriddenAt) return { text: `Accepted by the manager${g.overrideComment ? `: “${g.overrideComment}”` : ''}`, tone: 'ok' };
  const distance = g.distanceMeters !== null ? ` · ${g.distanceMeters >= 1000 ? `${(g.distanceMeters / 1000).toFixed(1)} km` : `${g.distanceMeters} m`}` : '';
  return { text: `${GEO_TEXT[g.status]}${distance}`, tone: g.status === 'PASS' ? 'ok' : g.status === 'FAIL' ? 'bad' : 'warn' };
}

const EXPENSE: Record<string, { label: string; icon: SymbolViewProps['name']; accent: Accent }> = {
  TA: { label: 'Travel allowance (TA)', icon: ICON.travel, accent: 'blue' },
  DA: { label: 'Daily allowance (DA)', icon: ICON.money, accent: 'green' },
  TRAVEL: { label: 'Travel', icon: ICON.travel, accent: 'blue' },
  MEAL: { label: 'Meal', icon: ICON.meal, accent: 'amber' },
  MISC: { label: 'Other', icon: ICON.other, accent: 'purple' },
};

/** A coloured square holding an icon. */
function Chip({ icon, accent, size = 36 }: { icon: SymbolViewProps['name']; accent: Accent; size?: number }) {
  return (
    <View style={[styles.chip, { width: size, height: size, backgroundColor: Accents[accent].bg }]}>
      <SymbolView name={icon} size={size * 0.55} tintColor={Accents[accent].solid} />
    </View>
  );
}

/** A white card with an icon, a title and a count. */
function Card({ icon, accent, title, count, children }: { icon: SymbolViewProps['name']; accent: Accent; title: string; count?: number; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <Chip icon={icon} accent={accent} />
        <ThemedText type="smallBold" style={styles.cardTitle}>
          {title}
        </ThemedText>
        {count !== undefined ? (
          <View style={[styles.count, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.countText}>
              {count}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Stat({ icon, accent, value, label }: { icon: SymbolViewProps['name']; accent: Accent; value: string; label: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: Accents[accent].bg, borderColor: Accents[accent].border }]}>
      <Chip icon={icon} accent={accent} size={32} />
      <ThemedText type="smallBold" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function Avatar({ name, accent }: { name: string; accent: Accent }) {
  return (
    <View style={[styles.avatar, { backgroundColor: Accents[accent].bg }]}>
      <ThemedText type="smallBold" style={[styles.avatarText, { color: Accents[accent].solid }]}>
        {initials(name)}
      </ThemedText>
    </View>
  );
}

function Pill({ text, accent }: { text: string; accent: Accent }) {
  return (
    <View style={[styles.pill, { backgroundColor: Accents[accent].bg }]}>
      <ThemedText type="smallBold" style={[styles.pillText, { color: Accents[accent].solid }]}>
        {text}
      </ThemedText>
    </View>
  );
}

function CallCard({
  name,
  call,
  samples,
  lbl,
  canAccept,
  onAccept,
}: {
  name: string;
  call: DcrDoctorCall | DcrChemistCall;
  samples?: string;
  lbl?: string;
  canAccept: boolean;
  onAccept: (callId: string, comment: string) => Promise<string | null>;
}) {
  const theme = useTheme();
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

  const geoColor = geo.tone === 'ok' ? '#15803D' : geo.tone === 'bad' ? theme.danger : theme.warning;

  return (
    <View
      style={[
        styles.call,
        { backgroundColor: flagged ? Accents.red.bg : theme.background, borderColor: flagged ? Accents.red.border : theme.border },
      ]}>
      <View style={styles.callHead}>
        <Avatar name={name} accent={flagged ? 'red' : 'teal'} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtle}>
            {formatWhen(call.recordedAt)}
          </ThemedText>
        </View>
        {flagged ? <Pill text="Flagged" accent="red" /> : null}
      </View>

      <Row label="Work type">
        <Pill text={workingTypeLabel(call.workingType)} accent="green" />
        {routeTypeLabel(call.routeType) ? <Pill text={routeTypeLabel(call.routeType)!} accent="slate" /> : null}
      </Row>
      <Row label="Location">
        <ThemedText type="smallBold" style={[styles.value, { color: geoColor }]}>
          {geo.text}
        </ThemedText>
      </Row>
      {call.accuracyMeters !== null ? (
        <Row label="GPS accuracy">
          <ThemedText type="small" style={styles.value}>{`± ${Math.round(call.accuracyMeters)} m`}</ThemedText>
        </Row>
      ) : null}
      {samples ? (
        <Row label="Samples">
          <ThemedText type="small" style={styles.value}>
            {samples}
          </ThemedText>
        </Row>
      ) : null}
      {lbl ? (
        <Row label="LBL">
          <ThemedText type="small" style={styles.value}>
            {lbl}
          </ThemedText>
        </Row>
      ) : null}
      {call.remarks ? (
        <Row label="Remarks">
          <ThemedText type="small" style={styles.value}>
            {call.remarks}
          </ThemedText>
        </Row>
      ) : null}

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
          <PrimaryButton
            label="✓  Accept this call"
            variant="text"
            onPress={() => setOpen(true)}
            style={[styles.acceptButton, { borderColor: Accents.green.solid, backgroundColor: Accents.green.bg }]}
          />
        )
      ) : null}
    </View>
  );
}

/**
 * The daily report under review (manager) or read-only (employee): stat tiles, the calls with their location result and an
 * Accept button for flagged ones, follow-ups, and the expenses. On a tablet the calls sit on the left and the expenses (and
 * `aside`, the request's history) on the right.
 */
export function DcrSummary({ recordId, canAct, aside, submitterId }: { recordId: string; canAct: boolean; aside?: ReactNode; submitterId?: string | undefined }) {
  const theme = useTheme();
  const { isTablet } = useResponsive();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{ data: DcrDetail | null; error: string | null }>({ data: null, error: null });

  useEffect(() => {
    let alive = true;
    getDcr(recordId)
      .then((data) => alive && setState({ data, error: null }))
      .catch((err) => alive && setState((s) => ({ ...s, error: errorText(err) })));
    return () => {
      alive = false;
    };
  }, [recordId, reloadKey]);
  const { data, error } = state;

  const accept = async (callId: string, comment: string): Promise<string | null> => {
    try {
      await acceptCall(recordId, callId, comment);
      setReloadKey((k) => k + 1);
      return null;
    } catch (err) {
      return errorText(err);
    }
  };

  if (!data) {
    return (
      <View style={styles.stack}>
        {error ? <Notice tone="danger">{error}</Notice> : <SkeletonLines />}
        {aside}
      </View>
    );
  }

  const flagged = [...data.doctorCalls, ...data.chemistCalls].filter((c) => c.geofence.status !== 'PASS' && !c.geofence.overriddenAt).length;
  const total = data.expenses.reduce((sum, e) => sum + e.amountPaise, 0);
  const orders = data.orders ?? [];
  const giftsGiven = data.giftsGiven ?? [];
  const giftRequests = data.giftRequests ?? [];
  const services = data.services ?? [];
  const sampleRequests = data.sampleRequests ?? [];

  const main = (
    <View style={styles.stack}>
      {submitterId ? <DoctorsToday userId={submitterId} date={data.reportDate} /> : null}
      {data.doctorCalls.length > 0 ? (
        <Card icon={ICON.doctor} accent="teal" title="Doctor calls" count={data.doctorCalls.length}>
          {data.doctorCalls.map((c) => (
            <CallCard
              key={c.id}
              name={c.doctorName}
              call={c}
              samples={c.samples.length ? c.samples.map((s) => `${s.productName} × ${s.quantity}`).join(', ') : undefined}
              lbl={c.lbl?.length ? c.lbl.map((l) => l.productName).join(', ') : undefined}
              canAccept={canAct}
              onAccept={accept}
            />
          ))}
        </Card>
      ) : null}

      {data.chemistCalls.length > 0 ? (
        <Card icon={ICON.chemist} accent="green" title="Chemist calls" count={data.chemistCalls.length}>
          {data.chemistCalls.map((c) => (
            <CallCard key={c.id} name={c.chemistName} call={c} canAccept={canAct} onAccept={accept} />
          ))}
        </Card>
      ) : null}

      {data.followups.length > 0 ? (
        <Card icon={ICON.followup} accent="sky" title="Followups" count={data.followups.length}>
          {data.followups.map((f) => (
            <View key={f.id} style={[styles.call, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={styles.callHead}>
                <Avatar name={f.subjectName} accent="sky" />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {f.subjectName}
                  </ThemedText>
                  {f.workingType ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.subtle}>
                      {[workingTypeLabel(f.workingType), routeTypeLabel(f.routeType)].filter(Boolean).join(' · ')}
                    </ThemedText>
                  ) : null}
                </View>
                <Pill text={f.subject === 'DOCTOR' ? 'Doctor' : 'Chemist'} accent={f.subject === 'DOCTOR' ? 'sky' : 'green'} />
              </View>
              <ThemedText type="small">{f.remarks}</ThemedText>
            </View>
          ))}
        </Card>
      ) : null}

      {/* The rest of the day (2026-11-28): what else they did or asked for on it, read only. */}
      {orders.length > 0 ? (
        <Card icon={ICON.order} accent="indigo" title="Orders" count={orders.length}>
          {orders.map((o) => (
            <ExtraRow key={o.id} name={o.outletName} accent="indigo" title={o.outletName} detail={[o.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist', o.items.map((i) => `${i.productName} × ${i.quantity}`).join(', '), o.remarks].filter(Boolean).join(' · ')} amount={o.totalAmountPaise} status={o.status} />
          ))}
        </Card>
      ) : null}
      {giftsGiven.length > 0 ? (
        <Card icon={ICON.gift} accent="pink" title="Gifts given" count={giftsGiven.length}>
          {giftsGiven.map((g) => (
            <ExtraRow key={g.id} name={g.doctorName} accent="pink" title={g.doctorName} detail={g.productName} amount={g.amountPaise} status="DONE" />
          ))}
        </Card>
      ) : null}
      {giftRequests.length > 0 ? (
        <Card icon={ICON.gift} accent="purple" title="Gift requests" count={giftRequests.length}>
          {giftRequests.map((g) => (
            <ExtraRow key={g.id} name={g.doctorName} accent="purple" title={g.doctorName} detail={[g.productName, g.note].filter(Boolean).join(' · ')} amount={g.amountPaise} status={g.status} />
          ))}
        </Card>
      ) : null}
      {services.length > 0 ? (
        <Card icon={ICON.service} accent="orange" title="Service requests" count={services.length}>
          {services.map((s) => (
            <ExtraRow key={s.id} name={s.doctorName} accent="orange" title={s.doctorName} detail={[serviceTitle(s.serviceType), s.remarks].filter(Boolean).join(' · ')} amount={s.amountPaise} status={s.status} />
          ))}
        </Card>
      ) : null}
      {sampleRequests.length > 0 ? (
        <Card icon={ICON.sample} accent="lime" title="Sample / LBL requests" count={sampleRequests.length}>
          {sampleRequests.map((r) => (
            <ExtraRow key={r.id} name={r.kind === 'LBL' ? 'L B' : 'S A'} accent="lime" title={r.kind === 'LBL' ? 'LBL request' : 'Sample request'} detail={[r.lines.map((l) => `${l.productName} × ${l.quantity}`).join(', '), r.remarks].filter(Boolean).join(' · ')} status={r.status} />
          ))}
        </Card>
      ) : null}
    </View>
  );

  const side = (
    <View style={styles.stack}>
      <Card icon={ICON.money} accent="amber" title="Expenses">
        {data.expenses.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            None claimed. TA and DA are worked out when the report is approved.
          </ThemedText>
        ) : (
          <>
            {data.expenses.map((e) => {
              const x = EXPENSE[e.type] ?? { label: e.type, icon: ICON.other, accent: 'slate' as Accent };
              return (
                <View key={e.id} style={styles.expense}>
                  <Chip icon={x.icon} accent={x.accent} size={34} />
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">{`${x.label}${e.source === 'AUTO' ? ' (worked out)' : ''}`}</ThemedText>
                    {e.remarks ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.subtle}>
                        {e.remarks}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="smallBold">{formatRupees(e.amountPaise)}</ThemedText>
                </View>
              );
            })}
            <View style={[styles.total, { backgroundColor: Accents.amber.bg, borderColor: Accents.amber.border }]}>
              <ThemedText type="smallBold">Total</ThemedText>
              <ThemedText type="smallBold" style={styles.totalAmount}>
                {formatRupees(total)}
              </ThemedText>
            </View>
          </>
        )}
      </Card>
      {aside}
    </View>
  );

  return (
    <View style={styles.stack}>
      <View style={styles.stats}>
        <Stat icon={ICON.doctor} accent="teal" value={String(data.doctorCalls.length)} label="Doctor calls" />
        <Stat icon={ICON.chemist} accent="green" value={String(data.chemistCalls.length)} label="Chemist calls" />
        <Stat icon={ICON.followup} accent="sky" value={String(data.followups.length)} label="Followups" />
        <Stat icon={ICON.money} accent="amber" value={formatRupees(total)} label="Expenses" />
        {orders.length > 0 ? <Stat icon={ICON.order} accent="indigo" value={String(orders.length)} label="Orders" /> : null}
      </View>

      {flagged > 0 ? (
        <View style={[styles.banner, { backgroundColor: Accents.amber.bg, borderColor: Accents.amber.border }]}>
          <ThemedText type="smallBold">{`${flagged} call${flagged === 1 ? ' was' : 's were'} flagged by the location check`}</ThemedText>
          {canAct ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtle}>
              Accepting a call is separate from approving the day.
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      {data.remarks ? (
        <Card icon={ICON.other} accent="indigo" title="Note for the day">
          <ThemedText type="small">{data.remarks}</ThemedText>
        </Card>
      ) : null}

      {isTablet ? (
        <View style={styles.columns}>
          <View style={styles.flex}>{main}</View>
          <View style={styles.sideColumn}>{side}</View>
        </View>
      ) : (
        <>
          {main}
          {side}
        </>
      )}
    </View>
  );
}

/** The report's date, for the screen header. */
export const dcrTitle = (reportDate: string) => `Daily report · ${prettyDay(reportDate)}`;

const styles = StyleSheet.create({
  extraRight: { alignItems: 'flex-end', gap: 2 },
  flex: { flex: 1 },
  stack: { gap: Spacing.three },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexGrow: 1, flexBasis: '45%', borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: 2 },
  statValue: { fontSize: 22, lineHeight: 28, marginTop: Spacing.one },
  statLabel: { fontSize: 12, lineHeight: 16 },
  chip: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: 2 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  sideColumn: { width: 340 },
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1, fontSize: 16, lineHeight: 22 },
  count: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { fontSize: 12, lineHeight: 16 },
  call: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  callHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, lineHeight: 18 },
  subtle: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rowLabel: { width: 96, fontSize: 13, lineHeight: 22 },
  rowValue: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  value: { fontSize: 13, lineHeight: 20 },
  pill: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, lineHeight: 16 },
  accept: { gap: Spacing.two },
  acceptButton: { borderWidth: 1, borderRadius: Spacing.two + 2, paddingVertical: Spacing.two + 2, alignItems: 'center' },
  expense: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: Spacing.two + 2, borderWidth: 1, padding: Spacing.three, marginTop: Spacing.one },
  totalAmount: { fontSize: 18, lineHeight: 24 },
});
