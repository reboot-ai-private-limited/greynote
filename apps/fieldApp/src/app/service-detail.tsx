import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalHistory } from '@/components/approval-history';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { CardSection, IconChip, InfoCard, Pill, StatusBanner, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError, apiGet } from '@/lib/api';
import { getApproval, type ApprovalDetail } from '@/lib/approvals';
import { formatRupees } from '@/lib/money';
import { serviceStage, type ServiceView } from '@/lib/services';
import { useOnline } from '@/offline';
import { formatWhen } from '@/offline/day';

const TYPE_LABEL: Record<string, string> = { TOUR_PACKAGE: 'Tour package', GIFT: 'Gift', ONLINE_PROMOTION: 'Online promotion', OTHERS: 'Others' };

type Detail = ServiceView & { createdAt?: string };

const errorText = (err: unknown) => (err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.');

/**
 * One service request (docs/mobile/service-requests.md): what was asked, where it stands (*Waiting for approval → Approved, to do
 * → Done*, or *Rejected*) and the approval trail. The MR never marks a service done; Admin or Accounts does, on the web.
 */
export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const online = useOnline();
  const [service, setService] = useState<Detail | null>(null);
  const [trail, setTrail] = useState<ApprovalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    (async () => {
      try {
        const s = await apiGet<Detail>(`/field-activity/doctor-services/${id}`, { auth: true, fy: true });
        if (!alive) return;
        setService(s);
        if (s.approval) {
          const t = await getApproval(s.approval.requestId).catch(() => null);
          if (alive) setTrail(t);
        }
      } catch (err) {
        if (alive) setError(errorText(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, online]);

  const stage = service ? (service.origin === 'ADMIN' && !service.doneAt ? { text: 'Set up by Admin, to do', accent: 'blue' as const } : serviceStage(service)) : null;

  return (
    <ScreenShell title="Service request" subtitle={service?.doctorName}>
      {!online ? <Notice tone="info">You’re offline. Connect to see this request.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {online && !service && !error ? <Skeleton cards={2} lines={3} /> : null}
      {service && stage ? (
        <>
          <StatusBanner
            accent={stage.accent}
            icon={service.doneAt ? sym('checkmark.circle', 'check_circle') : sym('clock', 'schedule')}
            title={stage.text}
            text={service.doneAt ? `Carried out on ${formatWhen(service.doneAt)}` : service.awaitingDone ? 'Approved. Admin or Accounts marks it done once it is carried out.' : undefined}
          />
          <InfoCard>
            <View style={styles.row}>
              <IconChip icon={sym('briefcase', 'work')} accent="indigo" />
              <View style={styles.grow}>
                <ThemedText type="smallBold">{TYPE_LABEL[service.serviceType] ?? service.serviceType}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{service.doctorName ?? 'Doctor'}</ThemedText>
              </View>
              <ThemedText type="smallBold">{formatRupees(service.amountPaise)}</ThemedText>
            </View>
            <Pill text={stage.text} accent={stage.accent} />
            {service.createdAt ? <ThemedText type="small" themeColor="textSecondary">{`Requested ${formatWhen(service.createdAt)}`}</ThemedText> : null}
            {service.remarks ? <ThemedText type="small">{service.remarks}</ThemedText> : null}
          </InfoCard>
          {trail ? (
            <CardSection icon={sym('clock.arrow.circlepath', 'history')} accent="blue" title="Approval trail">
              <ApprovalHistory request={trail} />
            </CardSection>
          ) : null}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
});
