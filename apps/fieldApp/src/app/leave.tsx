import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateStepper } from '@/components/date-stepper';
import { LeaveProof } from '@/components/leave-proof';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { Skeleton } from '@/components/skeleton';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDayGate } from '@/hooks/use-day-gate';
import { ApiError, NetworkError } from '@/lib/api';
import {
  addLeaveProof,
  editLeave,
  LEAVE_EDITABLE,
  listLeaveTypes,
  listMyLeaves,
  MAX_PROOF_FILES,
  requestLeave,
  withdrawLeave,
  type LeaveView,
} from '@/lib/leave';
import { formatSize, pickProofFile, type PickedProof } from '@/lib/proof-picker';
import { getRejectionReason } from '@/lib/planning';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { prettyDay } from '@/offline/day';
import type { HrSnapshot } from '@/types/sync';

const STATUS_TEXT: Record<string, string> = {
  SUBMITTED: 'Waiting for your manager',
  MANAGER_APPROVED: 'Approved by your manager, waiting for HR',
  APPROVED: 'Approved',
  REJECTED: 'Rejected — change it and send it again',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened — change it and send it again',
};

const errorText = (err: unknown, typeName?: string) => {
  if (err instanceof ApiError) {
    if (err.data?.code === 'PAYROLL_FINALIZED' || /salary .* already finalized/i.test(err.message)) return 'This month’s salary is already finalized.';
    if (err.status === 409 && (/day\(s\) of .* left|not enough leave left/i.test(err.message) || err.data?.field === 'leaveTypeId')) {
      return `Not enough ${typeName ?? 'leave'} left. Request Loss of Pay for the rest.`;
    }
  }
  return err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';
};

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

/**
 * Leave (PRD §6.2): your balances, a request, and what happened to the ones you sent. Available even
 * while your account is blocked. Requesting, changing and withdrawing need the internet; the balances
 * show from the last sync. The server counts the days (weekly offs and holidays don't count), checks
 * the balance and the backdate limit, and sends the request to your manager, then HR.
 */
export default function LeaveScreen() {
  const { today } = useDayGate();
  const online = useOnline();
  const hr = useCachedSource<HrSnapshot>('hr');

  const [leaves, setLeaves] = useState<LeaveView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<LeaveView | 'new' | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  // Which leave types take proof (from the server), and the files chosen on the form before it is sent.
  const [proofTypeIds, setProofTypeIds] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<PickedProof[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  const allTypes = hr.data?.leaveTypes ?? [];
  // A new request is for Casual, Sick or Earned leave (not Loss of Pay). The type of a leave already made is kept, so it can still be changed and sent again.
  const requestable = (name: string) => ['casual', 'sick', 'earned'].includes(name.trim().toLowerCase());
  const types = allTypes.filter((t) => requestable(t.name));
  // A leave can't start in the past (docs/mobile/leave.md rule 6).
  const earliest = today;

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    listLeaveTypes()
      .then((all) => alive && setProofTypeIds(new Set(all.filter((t) => t.allowsProof).map((t) => t.id))))
      .catch(() => undefined);
    (async () => {
      try {
        const list = await listMyLeaves();
        if (!alive) return;
        setLeaves(list);
        setLoadError(null);
        // Why a rejected leave was sent back.
        for (const l of list) {
          if (l.status === 'REJECTED' && l.approval) {
            getRejectionReason(l.approval.requestId)
              .then((r) => alive && r && setReasons((prev) => ({ ...prev, [l.id]: r })))
              .catch(() => undefined);
          }
        }
      } catch (err) {
        if (alive) setLoadError(errorText(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [online, reloadKey]);

  const startForm = (leave: LeaveView | 'new') => {
    setMsg(null);
    setChosen([]);
    setPickError(null);
    if (leave === 'new') {
      setTypeId(types[0]?.id ?? null);
      setStart(today);
      setEnd(today);
      setReason('');
    } else {
      setTypeId(leave.leaveTypeId);
      setStart(leave.startDate);
      setEnd(leave.endDate);
      setReason(leave.reason);
    }
    setEditing(leave);
  };

  const send = async () => {
    if (!online) {
      setMsg({ tone: 'info', text: 'You’re offline. Connect to the internet to send a leave request.' });
      return;
    }
    if (!typeId) return setMsg({ tone: 'danger', text: 'Choose a leave type.' });
    if (end < start) return setMsg({ tone: 'danger', text: 'The last day can’t be before the first day.' });
    if (!reason.trim()) return setMsg({ tone: 'danger', text: 'Say why you need the leave.' });
    setBusy(true);
    const body = { leaveTypeId: typeId, startDate: start, endDate: end, reason: reason.trim() };
    try {
      const leave = editing && editing !== 'new' ? await editLeave(editing.id, body) : await requestLeave(body);
      // The request is made; now its proof (optional). A file that fails doesn't undo the request.
      const attach = proofTypeIds.has(typeId) ? chosen : [];
      const failed: string[] = [];
      for (const f of attach) {
        try {
          await addLeaveProof(leave.id, f);
        } catch (err) {
          failed.push(`${f.name} (${errorText(err)})`);
        }
      }
      setEditing(null);
      setChosen([]);
      setMsg(
        failed.length === 0
          ? { tone: 'success', text: attach.length > 0 ? `Leave sent to your manager with ${attach.length} file${attach.length === 1 ? '' : 's'}.` : 'Leave sent to your manager.' }
          : { tone: 'danger', text: `Leave sent, but these files didn’t upload: ${failed.join('; ')}. You can attach them again from the list below.` },
      );
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err, allTypes.find((t) => t.id === typeId)?.name) });
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async () => {
    setPickError(null);
    const picked = await pickProofFile(chosen.length);
    if (!picked) return;
    if (picked.error || !picked.file) return setPickError(picked.error ?? 'Could not use that file.');
    setChosen((prev) => [...prev, picked.file!]);
  };

  const withdraw = async (l: LeaveView) => {
    if (!l.approval) return;
    if (!online) return setMsg({ tone: 'info', text: 'You’re offline. Connect to the internet to withdraw a leave.' });
    setBusy(true);
    try {
      await withdrawLeave(l.approval.requestId);
      setMsg({ tone: 'success', text: 'Leave withdrawn.' });
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <ScreenShell title={editing === 'new' ? 'Request leave' : 'Change leave'}>
        <View style={styles.block}>
          <ThemedText type="smallBold">Leave type</ThemedText>
          {types.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Connect to the internet once so your leave types can load.
            </ThemedText>
          ) : (
            <ChoiceChips options={allTypes.filter((t) => requestable(t.name) || t.id === typeId).map((t) => ({ value: t.id, label: t.name }))} value={typeId} onChange={setTypeId} disabled={busy} />
          )}
        </View>
        <DateStepper
          label="First day"
          value={start}
          min={earliest}
          disabled={busy}
          onChange={(d) => {
            setStart(d);
            if (end < d) setEnd(d);
          }}
        />
        <DateStepper label="Last day" value={end} min={start} disabled={busy} onChange={setEnd} />
        <TextField label="Reason" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy} />
        {typeId && proofTypeIds.has(typeId) ? (
          <View style={styles.block}>
            <ThemedText type="smallBold">Proof (optional)</ThemedText>
            {chosen.map((f, i) => (
              <View key={`${f.uri}-${i}`} style={styles.fileRow}>
                <ThemedText type="small" style={styles.fileName} numberOfLines={1}>
                  {`${f.name}${f.sizeBytes ? ` · ${formatSize(f.sizeBytes)}` : ''}`}
                </ThemedText>
                <PrimaryButton label="Remove" variant="text" disabled={busy} onPress={() => setChosen((prev) => prev.filter((_, j) => j !== i))} />
              </View>
            ))}
            {pickError ? <Notice tone="danger">{pickError}</Notice> : null}
            <PrimaryButton
              label={chosen.length === 0 ? 'Attach a file' : 'Attach another file'}
              variant="text"
              disabled={busy || chosen.length >= MAX_PROOF_FILES}
              onPress={chooseFile}
            />
            <ThemedText type="small" themeColor="textSecondary">
              PDF, JPG or PNG, up to 5 MB, at most 3 files. Sent together with your request.
            </ThemedText>
          </View>
        ) : null}
        {!online ? <Notice tone="info">You’re offline. You can fill this in, but sending needs the internet.</Notice> : null}
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label={editing === 'new' ? 'Send request' : 'Send again'} loading={busy} disabled={!online} onPress={send} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setEditing(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Leave">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <ThemedText type="smallBold">{`Your balances${hr.data ? ` · ${hr.data.leaveYear}` : ''}`}</ThemedText>
      {!hr.data || hr.data.balances.length === 0 ? (
        <Notice tone="info">Your leave balances load when you’re online. Connect once to see them.</Notice>
      ) : (
        hr.data.balances.map((b) => (
          <ThemedView key={b.leaveTypeId} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{b.leaveTypeName}</ThemedText>
            <ThemedText type="small">{`${b.availableDays} days available of ${b.allocatedDays}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`${b.usedDays} used${b.pendingDays > 0 ? ` · ${b.pendingDays} waiting for approval` : ''}`}
            </ThemedText>
          </ThemedView>
        ))
      )}

      <PrimaryButton label="Request leave" disabled={!online || types.length === 0} onPress={() => startForm('new')} />
      {!online ? <Notice tone="info">You’re offline. Requesting leave needs the internet.</Notice> : null}

      <ThemedText type="smallBold">Your requests</ThemedText>
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {leaves === null && !loadError ? (
        online ? (
          <Skeleton cards={2} lines={3} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Connect to the internet to see your requests.
          </ThemedText>
        )
      ) : null}
      {leaves !== null && leaves.length === 0 ? <Notice tone="info">You haven’t requested any leave yet.</Notice> : null}
      {(leaves ?? []).map((l) => (
        <ThemedView key={l.id} type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{`${l.leaveTypeName} · ${l.daysCount} ${l.daysCount === 1 ? 'day' : 'days'}`}</ThemedText>
          <ThemedText type="small">
            {l.startDate === l.endDate ? prettyDay(l.startDate) : `${prettyDay(l.startDate)} → ${prettyDay(l.endDate)}`}
          </ThemedText>
          <ThemedText type="small" themeColor={l.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
            {STATUS_TEXT[l.status] ?? l.status}
          </ThemedText>
          {reasons[l.id] ? (
            <ThemedText type="small" themeColor="danger">
              {`“${reasons[l.id]}”`}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {l.reason}
          </ThemedText>
          {l.allowsProof && (l.status === 'SUBMITTED' || LEAVE_EDITABLE.includes(l.status)) ? (
            <LeaveProof leaveId={l.id} files={l.attachments ?? []} online={online} onChanged={reload} />
          ) : null}
          {l.allowsProof && !(l.status === 'SUBMITTED' || LEAVE_EDITABLE.includes(l.status)) && (l.attachments ?? []).length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {`Proof: ${(l.attachments ?? []).map((a) => a.fileName).join(', ')}`}
            </ThemedText>
          ) : null}
          {l.status === 'SUBMITTED' || LEAVE_EDITABLE.includes(l.status) ? (
            <View style={styles.actions}>
              {LEAVE_EDITABLE.includes(l.status) ? <PrimaryButton label="Change" variant="text" disabled={busy} onPress={() => startForm(l)} /> : null}
              {l.status === 'SUBMITTED' ? <PrimaryButton label="Withdraw" variant="text" disabled={busy} onPress={() => withdraw(l)} /> : null}
            </View>
          ) : null}
        </ThemedView>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fileName: { flex: 1 },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
