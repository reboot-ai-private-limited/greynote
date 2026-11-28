import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardSection, CollapsibleSection, Pill, StatusBanner, SummaryStrip, sym } from '@/components/ui-cards';
import { Accents, Spacing, type Accent } from '@/constants/theme';
import { confirmRemove, removeDayRecord } from '@/lib/day-records';
import { formatRupees } from '@/lib/money';
import { SERVICE_TYPE_LABEL } from '@/lib/services';
import { isFieldDay, needsDayNote, workingTypeLabel } from '@/lib/planning';
import { useCallDoctors } from '@/hooks/use-call-doctors';
import { useDayGate } from '@/hooks/use-day-gate';
import { useReportSent } from '@/hooks/use-report-sent';
import { DAY_KINDS, finalSubmit, NOT_ASSIGNED_REFUSALS, prettyDay, REMOVABLE_REFUSALS, useOnline, useRecords, type OutboxRecord, type SyncKind } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { addDays, businessToday, monthOf } from '@/offline/day';
import type { ConfigSnapshot, DoctorServiceType, FieldActivitySnapshot, FieldMasterDataSnapshot, PlanningSnapshot } from '@/types/sync';

const STATUS_TEXT: Record<OutboxRecord['status'], string> = {
  DRAFT: 'Not sent yet',
  QUEUED: 'Waiting to send',
  SYNCED: 'Sent',
  FAILED: 'Not accepted',
};

const EXPENSE_LABEL: Record<string, string> = { TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other' };

/** What the day's records carry, as far as the Summary reads them. */
type DayCall = { doctorId?: string; chemistId?: string; remarks?: string | null; workWith?: string[]; samples?: { productId: string; quantity: number }[]; lbl?: { productId: string }[] };
type DayOrder = { outletType: 'CHEMIST' | 'DISTRIBUTOR'; outletId: string; orderDate: string; lines: { productId: string; quantity: number; unitPricePaise: number }[] };
type DayService = { doctorId: string; serviceType: DoctorServiceType; amountPaise: number; remarks: string | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const notAccepted = (rows: OutboxRecord[]) => {
  const n = rows.filter((r) => r.status === 'FAILED').length;
  return n > 0 ? `${n} to fix` : null;
};

const DCR_TEXT: Record<string, string> = {
  SUBMITTED: 'Submitted — waiting for your manager',
  MANAGER_APPROVED: 'Approved by your manager',
  APPROVED: 'Approved',
  REJECTED: 'Rejected — fix it and submit again',
  REOPENED: 'Reopened — fix it and submit again',
  WITHDRAWN: 'Withdrawn',
  DRAFT: 'Saved, not submitted',
};

type Msg = { tone: 'danger' | 'success' | 'info' | 'warning'; text: string };

/**
 * Summary & Final Submission (PRD §6.2.D, docs/mobile/dcr.md): everything logged today in one place, and the button that
 * sends the day to your manager. Calls, followups and expenses are kept on the phone until now; Final Submission needs the
 * internet, sends them in order, and a record the server refuses is shown here with the reason so you can fix it and submit
 * again. Every day gets a report: on a Meeting or Conference day it is a note for the day (required), on a Strike day one tap.
 */
export default function SummaryScreen() {
  const gate = useDayGate();
  const online = useOnline();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const { records } = useRecords(DAY_KINDS);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [note, setNote] = useState('');

  // A manager's calls can be on doctors of anyone below them, which the snapshot doesn't hold.
  const { doctors: callDoctors } = useCallDoctors();
  const names = useMemo(
    () => new Map([...callDoctors, ...(master.data?.chemists ?? [])].map((o) => [o.id, o.name])),
    [callDoctors, master.data],
  );

  const today = gate.today;
  // docs/mobile/dcr.md rule 12: with the default cutoff day 1 (Admin's DCR_SUBMIT_CUTOFF_DAY), the month's last day must be sent that day.
  const config = useCachedSource<ConfigSnapshot>('config');
  const cutoffDay = Number(config.data?.settings.DCR_SUBMIT_CUTOFF_DAY ?? '1');
  const lastDayDue = cutoffDay === 1 && monthOf(addDays(today, 1)) !== monthOf(today);
  const dayRecords = records.filter(
    (r) => !r.deleted && DAY_KINDS.includes(r.kind) && (r.payload as { reportDate?: string }).reportDate === today,
  );
  // Sent on their own, not with the report, but part of the day (2026-11-28): orders, doctor services and gifts given today.
  const { records: standalone } = useRecords(['ORDER', 'DOCTOR_SERVICE', 'GIFT_DONE']);
  const madeToday = (r: OutboxRecord) => businessToday(config.data?.settings.BUSINESS_TIMEZONE, new Date(r.clientCreatedAt), config.data?.settings.DAY_START_TIME) === today;
  const orders = standalone.filter((r) => !r.deleted && r.kind === 'ORDER' && (r.payload as DayOrder).orderDate === today);
  const services = standalone.filter((r) => !r.deleted && r.kind === 'DOCTOR_SERVICE' && madeToday(r));
  const gifts = standalone.filter((r) => !r.deleted && r.kind === 'GIFT_DONE' && madeToday(r));
  const ofKind = (...kinds: SyncKind[]) => dayRecords.filter((r) => kinds.includes(r.kind));
  const doctorCalls = ofKind('DOCTOR_CALL');
  const chemistCalls = ofKind('CHEMIST_CALL');
  const followups = ofKind('DOCTOR_FOLLOWUP', 'CHEMIST_FOLLOWUP');
  const expenses = ofKind('EXPENSE');
  const productName = (id: string) => master.data?.products.find((p) => p.id === id)?.name ?? 'Product';
  const outletName = (o: DayOrder) =>
    (o.outletType === 'DISTRIBUTOR' ? master.data?.distributors?.find((d) => d.id === o.outletId)?.name : names.get(o.outletId)) ?? (o.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist');
  // Samples and LBL, per product, with who got them (from the day's doctor calls).
  const given = (pick: (c: DayCall) => { productId: string; quantity: number }[]) => {
    const byProduct = new Map<string, Map<string, number>>();
    for (const r of doctorCalls) {
      const c = r.payload as DayCall;
      for (const line of pick(c)) {
        const who = byProduct.get(line.productId) ?? new Map<string, number>();
        who.set(c.doctorId ?? '', (who.get(c.doctorId ?? '') ?? 0) + line.quantity);
        byProduct.set(line.productId, who);
      }
    }
    return [...byProduct].map(([productId, who]) => ({ productId, total: [...who.values()].reduce((a, b) => a + b, 0), who: [...who].map(([id, n]) => ({ name: names.get(id) ?? 'Doctor', n })) }));
  };
  const samples = given((c) => c.samples ?? []);
  const lbl = given((c) => (c.lbl ?? []).map((l) => ({ productId: l.productId, quantity: 1 })));
  const sampleUnits = samples.reduce((n, s) => n + s.total, 0);
  const lblCount = lbl.reduce((n, s) => n + s.total, 0);
  const expenseTotal = expenses.reduce((n, r) => n + ((r.payload as { amountPaise?: number }).amountPaise ?? 0), 0);
  const dcr = activity.data?.dcrs?.find((d) => d.reportDate === today) ?? null;
  const alreadySent = useReportSent(today);

  const failed = dayRecords.filter((r) => r.status === 'FAILED');

  const plan = planning.data?.dailyPlans.find((p) => p.planDate === today) ?? null;
  const noteRequired = plan ? needsDayNote(plan.workingType) : false;

  const describe = (r: OutboxRecord) => {
    const p = r.payload as { doctorId?: string; chemistId?: string; type?: string; amountPaise?: number };
    const who = names.get(p.doctorId ?? p.chemistId ?? '');
    if (r.kind === 'EXPENSE') return `${EXPENSE_LABEL[p.type ?? ''] ?? 'Expense'} · ${formatRupees(p.amountPaise ?? 0)}`;
    return who ?? (p.doctorId ? 'Doctor (no longer active)' : p.chemistId ? 'Chemist (no longer active)' : 'Record');
  };

  const submit = async () => {
    if (noteRequired && !note.trim()) {
      setMsg({ tone: 'danger', text: `Write a note for the day (agenda, venue) — it is required on a ${workingTypeLabel(plan!.workingType)} day.` });
      return;
    }
    setBusy(true);
    setMsg({ tone: 'info', text: 'Sending today’s report…' });
    try {
      const result = await finalSubmit(today, note.trim() || null);
      if (result.offline) {
        setMsg({ tone: 'warning', text: 'The connection dropped. Nothing was lost — your report stays on this phone. Try again when you are online.' });
      } else if (result.submit?.status === 'SYNCED') {
        setMsg({ tone: 'success', text: 'Today’s report is submitted. Your manager will review it.' });
      } else if (result.submit?.errorMessage) {
        setMsg({ tone: 'danger', text: result.submit.errorMessage });
      } else if (result.failed > 0 || result.held > 0) {
        setMsg({ tone: 'danger', text: 'Some records were not accepted. Fix them below and submit again.' });
      } else {
        setMsg({ tone: 'danger', text: result.error ?? 'The report could not be submitted. Try again.' });
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not submit the report.' });
    } finally {
      setBusy(false);
    }
  };

  const blocked = gate.state === 'blocked';
  // Today's plan must be approved (gate open), and nothing the server refused may be left: fix those first.
  const canSubmit = online && gate.state === 'open' && !alreadySent && failed.length === 0;

  const count = (kinds: SyncKind[]) => dayRecords.filter((r) => kinds.includes(r.kind)).length;
  const dcrAccent: Accent = !dcr ? 'slate' : dcr.status === 'REJECTED' ? 'red' : dcr.status === 'APPROVED' ? 'green' : dcr.status === 'DRAFT' ? 'slate' : 'amber';

  return (
    <ScreenShell
      title="Summary"
      subtitle={`${prettyDay(today)} · send the day to your manager`}
      footer={
        alreadySent ? null : (
          <PrimaryButton
            label={dayRecords.length === 0 ? 'Submit today’s report (nothing logged)' : 'Final Submission'}
            loading={busy}
            disabled={!canSubmit}
            onPress={submit}
          />
        )
      }>
      {blocked || gate.state === 'unknown' ? <Notice tone="warning">{gate.reason ?? ''}</Notice> : null}
      {lastDayDue ? (
        <Notice tone="warning" title="Last day of the month">
          Submit today’s report today. After midnight the server refuses it unless Admin allows it late.
        </Notice>
      ) : null}
      {gate.state === 'closed' ? (
        <>
          <Notice tone="warning" title={gate.cause === 'MONTHLY_PLAN' ? 'Tour plan not approved' : 'Today’s plan isn’t approved'}>
            {gate.reason ?? ''}
          </Notice>
          {gate.cause === 'MONTHLY_PLAN' ? (
            <PrimaryButton label="Go to Tour Plan" variant="text" onPress={() => router.push({ pathname: '/monthly-plan', params: { month: 'current' } })} />
          ) : null}
        </>
      ) : null}
      {dcr ? (
        <StatusBanner accent={dcrAccent} icon={sym('doc.text', 'description')} title="Today’s report" text={DCR_TEXT[dcr.status] ?? dcr.status} />
      ) : alreadySent ? null : (
        <StatusBanner accent="slate" icon={sym('square.and.pencil', 'edit')} title="Not submitted yet" text="Check what you logged below, then send the day." />
      )}
      {!online ? <Notice tone="info">You’re offline. Your report is kept on this phone; Final Submission needs the internet.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <SummaryStrip
        items={[
          { label: 'Calls', value: count(['DOCTOR_CALL', 'CHEMIST_CALL']), accent: 'blue' },
          { label: 'Follow-ups', value: count(['DOCTOR_FOLLOWUP', 'CHEMIST_FOLLOWUP']), accent: 'teal' },
          { label: 'To fix', value: failed.length, accent: failed.length > 0 ? 'red' : 'slate' },
        ]}
      />

      {/* The day in stacks (2026-11-28): each closed until tapped; one holding a record to fix opens by itself. */}
      {dayRecords.length + orders.length + services.length + gifts.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing logged yet. Add calls, followups or expenses from Home.
        </ThemedText>
      ) : null}
      {doctorCalls.length > 0 ? (
        <CollapsibleSection icon={sym('stethoscope', 'medical_services')} accent="blue" title="Doctor calls" count={doctorCalls.length} summary={doctorCalls.map(describe).join(', ')} alert={notAccepted(doctorCalls)}>
          {doctorCalls.map((r) => {
            const c = r.payload as DayCall;
            const extra = [
              c.samples?.length ? `Samples: ${c.samples.map((x) => `${productName(x.productId)} × ${x.quantity}`).join(', ')}` : null,
              c.lbl?.length ? `LBL: ${c.lbl.map((x) => productName(x.productId)).join(', ')}` : null,
              c.workWith?.length ? `With ${plural(c.workWith.length, 'colleague')}` : null,
              c.remarks ? `“${c.remarks}”` : null,
            ];
            return <RecordRow key={r.clientId} r={r} title={describe(r)} lines={extra} onError={setMsg} />;
          })}
        </CollapsibleSection>
      ) : null}
      {chemistCalls.length > 0 ? (
        <CollapsibleSection icon={sym('cross.case', 'local_pharmacy')} accent="teal" title="Chemist calls" count={chemistCalls.length} summary={chemistCalls.map(describe).join(', ')} alert={notAccepted(chemistCalls)}>
          {chemistCalls.map((r) => (
            <RecordRow key={r.clientId} r={r} title={describe(r)} lines={[(r.payload as DayCall).remarks ? `“${(r.payload as DayCall).remarks}”` : null]} onError={setMsg} />
          ))}
        </CollapsibleSection>
      ) : null}
      {followups.length > 0 ? (
        <CollapsibleSection icon={sym('text.bubble', 'chat')} accent="indigo" title="Follow-ups" count={followups.length} summary={followups.map(describe).join(', ')} alert={notAccepted(followups)}>
          {followups.map((r) => (
            <RecordRow key={r.clientId} r={r} title={`${r.kind === 'DOCTOR_FOLLOWUP' ? 'Doctor' : 'Chemist'} · ${describe(r)}`} lines={[(r.payload as DayCall).remarks ? `“${(r.payload as DayCall).remarks}”` : null]} onError={setMsg} />
          ))}
        </CollapsibleSection>
      ) : null}
      {samples.length > 0 ? (
        <CollapsibleSection icon={sym('shippingbox', 'inventory_2')} accent="amber" title="Samples given" count={sampleUnits} summary={samples.map((x) => `${productName(x.productId)} × ${x.total}`).join(', ')}>
          {samples.map((x) => (
            <Line key={x.productId} title={`${productName(x.productId)} × ${x.total}`} text={x.who.map((w) => `${w.name} ${w.n}`).join(', ')} />
          ))}
        </CollapsibleSection>
      ) : null}
      {lbl.length > 0 ? (
        <CollapsibleSection icon={sym('doc.richtext', 'article')} accent="purple" title="LBL given" count={lblCount} summary={lbl.map((x) => productName(x.productId)).join(', ')}>
          {lbl.map((x) => (
            <Line key={x.productId} title={`${productName(x.productId)} · ${x.total}`} text={x.who.map((w) => w.name).join(', ')} />
          ))}
        </CollapsibleSection>
      ) : null}
      {orders.length > 0 ? (
        <CollapsibleSection icon={sym('cart', 'shopping_cart')} accent="green" title="Orders" count={orders.length} summary={formatRupees(orders.reduce((n, r) => n + (r.payload as DayOrder).lines.reduce((m, l) => m + l.quantity * l.unitPricePaise, 0), 0))} alert={notAccepted(orders)}>
          {orders.map((r) => {
            const o = r.payload as DayOrder;
            const total = o.lines.reduce((m, l) => m + l.quantity * l.unitPricePaise, 0);
            return <RecordRow key={r.clientId} r={r} title={outletName(o)} lines={[`${plural(o.lines.length, 'item')} · ${formatRupees(total)}`]} onError={setMsg} removable={false} />;
          })}
        </CollapsibleSection>
      ) : null}
      {services.length > 0 ? (
        <CollapsibleSection icon={sym('hand.raised', 'volunteer_activism')} accent="indigo" title="Doctor services requested" count={services.length} summary={services.map((r) => names.get((r.payload as DayService).doctorId) ?? 'Doctor').join(', ')} alert={notAccepted(services)}>
          {services.map((r) => {
            const v = r.payload as DayService;
            return <RecordRow key={r.clientId} r={r} title={names.get(v.doctorId) ?? 'Doctor'} lines={[`${SERVICE_TYPE_LABEL[v.serviceType] ?? v.serviceType} · ${formatRupees(v.amountPaise)}`, v.remarks ? `“${v.remarks}”` : null]} onError={setMsg} removable={false} />;
          })}
        </CollapsibleSection>
      ) : null}
      {gifts.length > 0 ? (
        <CollapsibleSection icon={sym('gift', 'redeem')} accent="amber" title="Gifts given" count={gifts.length} alert={notAccepted(gifts)}>
          {gifts.map((r) => {
            const g = activity.data?.pendingGifts?.find((x) => x.id === (r.payload as { giftId: string }).giftId);
            return <RecordRow key={r.clientId} r={r} title={g ? `${names.get(g.doctorId) ?? 'Doctor'} · ${g.productName}` : 'Gift'} lines={[]} onError={setMsg} removable={false} />;
          })}
        </CollapsibleSection>
      ) : null}
      {expenses.length > 0 ? (
        <CollapsibleSection icon={sym('indianrupeesign', 'currency_rupee')} accent="purple" title="Expenses" count={expenses.length} summary={`Total ${formatRupees(expenseTotal)}`} alert={notAccepted(expenses)}>
          {expenses.map((r) => (
            <RecordRow key={r.clientId} r={r} title={describe(r)} lines={[(r.payload as { remarks?: string | null }).remarks ? `“${(r.payload as { remarks?: string | null }).remarks}”` : null]} onError={setMsg} removable={false} />
          ))}
        </CollapsibleSection>
      ) : null}

      {failed.length > 0 ? (
        <Notice tone="danger" title="Fix before submitting">
          {'Open the screen for each record marked “Not accepted”, correct it (or remove it where it says so), and submit again.'}
        </Notice>
      ) : null}

      {alreadySent ? null : (
        <>
          {plan && !isFieldDay(plan.workingType) ? (
            <Notice tone="info" title={`Today is a ${workingTypeLabel(plan.workingType)} day`}>
              {noteRequired
                ? 'There are no calls today. Write a note for the day (agenda, venue) and submit — the note is required.'
                : 'There are no calls today. Submit the day; a note is optional.'}
            </Notice>
          ) : null}
          <CardSection icon={sym('text.bubble', 'chat')} accent="teal" title={noteRequired ? 'Note for the day (required)' : 'Note for the day (optional)'}>
            <TextField
              label="Note"
              placeholder={noteRequired ? 'Agenda, venue…' : undefined}
              value={note}
              onChangeText={(t) => {
                setNote(t);
                setMsg(null);
              }}
              multiline
              maxLength={1000}
              editable={!busy}
            />
          </CardSection>
        </>
      )}
    </ScreenShell>
  );
}

const RECORD_ACCENT: Record<OutboxRecord['status'], Accent> = { DRAFT: 'slate', QUEUED: 'amber', SYNCED: 'green', FAILED: 'red' };

/** One record of the day: what it is, where it is in sending, the details, and what to do when the server refused it. */
function RecordRow({ r, title, lines, onError, removable = true }: { r: OutboxRecord; title: string; lines: (string | null)[]; onError: (m: Msg) => void; removable?: boolean }) {
  return (
    <ThemedView style={[styles.row, { borderColor: r.status === 'FAILED' ? Accents.red.border : Accents.slate.border }]}>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>{title}</ThemedText>
        <Pill text={STATUS_TEXT[r.status]} accent={RECORD_ACCENT[r.status]} />
      </View>
      {lines.filter(Boolean).map((l) => (
        <ThemedText key={l} type="small" themeColor="textSecondary">
          {l}
        </ThemedText>
      ))}
      {r.status === 'FAILED' && r.errorMessage ? (
        <ThemedText type="small" themeColor="danger">
          {r.errorMessage}
        </ThemedText>
      ) : null}
      {r.status === 'FAILED' && r.errorCode && NOT_ASSIGNED_REFUSALS.has(r.errorCode) ? (
        <ThemedText type="small" themeColor="textSecondary">
          {'Remove this record. If you did visit, ask your manager or Admin.'}
        </ThemedText>
      ) : null}
      {/* Refused for good (its location, or it is no longer yours): nothing was stored, and sending it again won't help — drop it. */}
      {removable && r.status === 'FAILED' && r.errorCode && REMOVABLE_REFUSALS.has(r.errorCode) ? (
        <PrimaryButton
          label="Remove this record"
          variant="text"
          onPress={() =>
            confirmRemove(r.kind.endsWith('FOLLOWUP') ? 'follow-up' : 'call', () =>
              void removeDayRecord(r).catch((err) => onError({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not remove it.' })),
            )
          }
        />
      ) : null}
    </ThemedView>
  );
}

/** A line of a totals stack (samples, LBL): the product and who got it. */
function Line({ title, text }: { title: string; text: string }) {
  return (
    <ThemedView style={[styles.row, { borderColor: Accents.slate.border }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.one, borderWidth: 1, borderRadius: Spacing.two + 2, padding: Spacing.two + 2, backgroundColor: 'transparent' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
