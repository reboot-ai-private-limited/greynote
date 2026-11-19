import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { reopenTourPlan, type getTeamMemberTourPlan, type ReopenDuration } from '@/lib/planning';
import { useOnline } from '@/offline';
import { monthOf, nowMs } from '@/offline/day';

import { Notice } from '../../notice';
import { PrimaryButton } from '../../primary-button';
import { TextField } from '../../text-field';
import { ThemedText } from '../../themed-text';

type TourPlan = NonNullable<Awaited<ReturnType<typeof getTeamMemberTourPlan>>>;

const REASON_MAX = 500;
const DURATIONS: [ReopenDuration, string][] = [['30m', '30 min'], ['1h', '1 hour'], ['12h', '12 hours']];

/**
 * **Reopen Tour Plan** (decision-log 2026-11-19): a manager sends an approved plan of someone below them back to that person, with a reason. They change the days
 * after today (days over, or whose daily plan is sent, stay as they are) and send it again in the running month; their manager or Admin approves it again. Meanwhile they
 * can keep working the days already approved. Shown for this month and later; a plan already reopened says who it waits for.
 */
export function ReopenTourPlan({ plan, personName, onDone }: { plan: TourPlan | null; personName: string; onDone: () => void }) {
  const online = useOnline();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<ReopenDuration>('1h');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  if (!plan || plan.planMonth < monthOf(new Date(nowMs()).toISOString().slice(0, 10))) return null;

  if (plan.status === 'REOPENED') {
    return <Notice tone="info" title="Reopened">{`Waiting for ${personName} to change it and send it again.`}</Notice>;
  }
  if ((plan.status !== 'APPROVED' && plan.status !== 'MANAGER_APPROVED') || !plan.approval) return null;
  const requestId = plan.approval.requestId;

  const send = async () => {
    if (reason.trim() === '') return setMsg({ tone: 'danger', text: 'Say why, so they know what to change.' });
    setBusy(true);
    setMsg(null);
    try {
      await reopenTourPlan(requestId, reason, duration);
      setAsking(false);
      setReason('');
      setMsg({ tone: 'success', text: `Sent back to ${personName}. They can change the days after today and send it again.` });
      onDone();
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof ApiError || err instanceof NetworkError ? err.message : 'Could not reopen it. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {asking ? (
        <>
          <TextField label={`Why reopen it? ${personName} sees this`} value={reason} onChangeText={setReason} maxLength={REASON_MAX} multiline editable={!busy} />
          <ThemedText type="small" themeColor="textSecondary">How long do they have to send it again?</ThemedText>
          <View style={styles.row}>
            {DURATIONS.map(([value, label]) => (
              <PrimaryButton key={value} label={label} variant={duration === value ? 'filled' : 'text'} disabled={busy} onPress={() => setDuration(value)} />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {`${personName} can change the days after today and send it again; days that are over, or whose daily plan was sent, stay as they are. They can keep working meanwhile.`}
          </ThemedText>
          <PrimaryButton label="Send back for changes" loading={busy} disabled={!online} onPress={() => void send()} />
          <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setAsking(false)} />
        </>
      ) : (
        <PrimaryButton label="Reopen Tour Plan" variant="text" disabled={!online} onPress={() => setAsking(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: Spacing.two }, row: { flexDirection: 'row', gap: Spacing.two } });
