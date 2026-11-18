import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ApprovalHistory } from '@/components/approval-history';
import { ApprovalSummary } from '@/components/approval-summary';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, sym } from '@/components/ui-cards';
import { useCallDoctors } from '@/hooks/use-call-doctors';
import { getApproval, type ApprovalDetail } from '@/lib/approvals';
import { getDailyPlanDetail, type DailyPlanDetail } from '@/lib/planning';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';

/**
 * One of your Daily Plans in detail, read only: the working type, routes, who you worked with, the doctors by name (those carried from an earlier day marked), its status
 * and the approval history. Opened from Reports → Daily plan. Needs a connection for the history.
 */
export default function DailyPlanDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const day = String(date);
  const online = useOnline();
  const { byId } = useCallDoctors();
  const plan = useCachedFetch<DailyPlanDetail | null>(`daily-plan-detail:${day}`, () => getDailyPlanDetail(day));
  const requestId = plan.data?.approval?.requestId ?? null;
  const approval = useCachedFetch<ApprovalDetail | null>(`daily-plan-approval:${requestId ?? 'none'}`, async () => (requestId ? getApproval(requestId) : null));

  return (
    <ScreenShell title={`Daily plan · ${prettyDay(day)}`} onRefresh={() => { plan.reload(); approval.reload(); }} refreshing={plan.refreshing}>
      {!online && !plan.data ? <Notice tone="info">Connect to see this plan.</Notice> : null}
      {plan.error && online ? <Notice tone="danger">{plan.error}</Notice> : null}
      {plan.loading && plan.data === undefined ? <Skeleton cards={2} lines={3} /> : null}
      {plan.data === null ? <Notice tone="info">No Daily Plan was made for this day.</Notice> : null}

      {plan.data && (plan.data.doctors ?? []).length > 0 ? (
        <CardSection icon={sym('stethoscope', 'medical_services')} accent="teal" title="Doctors planned" count={plan.data.doctors!.length}>
          {plan.data.doctors!.map((d) => (
            <InfoCard key={d.doctorId}>
              <ThemedText type="smallBold">{byId.get(d.doctorId)?.name ?? 'Doctor'}</ThemedText>
              {d.carriedFrom ? <ThemedText type="small" themeColor="warning">{`Carried from ${prettyDay(d.carriedFrom)} (missed earlier)`}</ThemedText> : null}
            </InfoCard>
          ))}
        </CardSection>
      ) : null}

      {approval.data ? <ApprovalSummary request={approval.data} aside={<ApprovalHistory request={approval.data} />} /> : null}
      {plan.data && !requestId ? <ThemedText type="small" themeColor="textSecondary" style={styles.note}>Not sent for approval yet.</ThemedText> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ note: { paddingHorizontal: 4 } });
