import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import { getDailyPlanRecord, type DailyPlanRecord } from '@/lib/approvals';
import { amendDailyPlan, isFieldDay, WORKING_TYPES, workingTypeLabel, type WorkingType } from '@/lib/planning';
import { useOnline } from '@/offline';
import { prettyDay } from '@/offline/day';

/** The form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['workingType', 'reason'];
const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Amend a team member's Daily Plan (managers above them, and Admin): change the working type and remarks, with a required
 * reason. The plan keeps its approval; the old day is kept on it and the employee sees it was changed. The phone can't list
 * another employee's routes, so a Field Work or Doctor Campaign day keeps the routes it already has and a day with none can't
 * become one here. The server refuses an amend once the day is over or the employee has submitted that day's report.
 */
export default function AmendPlanScreen() {
  const { id, who } = useLocalSearchParams<{ id: string; who?: string }>();
  const online = useOnline();
  const fe = useFormErrors(FIELD_ORDER);
  const [plan, setPlan] = useState<DailyPlanRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workingType, setWorkingType] = useState<WorkingType>('FIELD_WORK');
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    if (!id || !online) return;
    let alive = true;
    getDailyPlanRecord(String(id))
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        setWorkingType(p.workingType as WorkingType);
        setRemarks(p.remarks ?? '');
        setLoadError(null);
      })
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [id, online]);

  const noRoutes = plan !== null && plan.routeIds.length === 0;
  const unchanged = plan !== null && workingType === plan.workingType && remarks.trim() === (plan.remarks ?? '').trim();

  async function save() {
    if (!plan) return;
    const problems: Record<string, string> = {};
    if (isFieldDay(workingType) && noRoutes) {
      problems.workingType = `A ${workingTypeLabel(workingType)} day needs routes, and the phone can’t pick routes for another employee. Choose a different working type.`;
    } else if (unchanged) {
      problems.workingType = 'Change the working type or the remarks first.';
    }
    if (!reason.trim()) problems.reason = 'Give the reason — the employee will see it.';
    if (Object.keys(problems).length > 0) {
      setMsg({ tone: 'warning', text: 'Fix the fields marked in red.' });
      return fe.fail(problems);
    }
    fe.clearAll();
    setBusy(true);
    setMsg(null);
    try {
      await amendDailyPlan(
        plan.id,
        { workingType, workWith: plan.workWith, routeIds: isFieldDay(workingType) ? plan.routeIds : [], remarks: remarks.trim() || null },
        reason,
      );
      Alert.alert('Plan amended', 'The employee will see the change and your reason.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="Amend plan">
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to amend a plan.</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {online && !plan && !loadError ? <Skeleton cards={2} lines={3} /> : null}

      {plan ? (
        <>
          <ThemedText type="smallBold">{`${who ? `${who} · ` : ''}${prettyDay(plan.planDate)}`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`Now: ${workingTypeLabel(plan.workingType as WorkingType)}${plan.routeIds.length ? ` · ${plan.routeIds.length} route${plan.routeIds.length === 1 ? '' : 's'}` : ''}`}
          </ThemedText>

          <ThemedText type="smallBold">Working type</ThemedText>
          <FormField form={fe} name="workingType">
            <ChoiceChips
              options={WORKING_TYPES}
              value={workingType}
              onChange={(w) => {
                setWorkingType(w);
                setMsg(null);
                fe.clear('workingType');
              }}
              disabled={busy}
            />
          </FormField>
          {isFieldDay(workingType) && !noRoutes ? (
            <ThemedText type="small" themeColor="textSecondary">Routes stay as they are.</ThemedText>
          ) : null}
          {!isFieldDay(workingType) && plan.routeIds.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">Routes are cleared for this working type.</ThemedText>
          ) : null}

          <TextField
            label="Remarks (optional)"
            value={remarks}
            onChangeText={(t) => {
              setRemarks(t);
              setMsg(null);
              fe.clear('workingType');
            }}
            multiline
            maxLength={1000}
            editable={!busy}
          />
          <FormField form={fe} name="reason" outline={false}>
            <TextField
              label="Why is the plan changing? (required)"
              value={reason}
              onChangeText={(t) => {
                setReason(t);
                setMsg(null);
                fe.clear('reason');
              }}
              error={fe.errors.reason}
              multiline
              maxLength={500}
              editable={!busy}
            />
          </FormField>

          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <PrimaryButton label="Save amendment" loading={busy} disabled={!online} onPress={save} />
        </>
      ) : null}
    </ScreenShell>
  );
}
