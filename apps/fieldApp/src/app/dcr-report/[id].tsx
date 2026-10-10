import { useLocalSearchParams } from 'expo-router';

import { DcrSummary } from '@/components/approval-summary';
import { ScreenShell } from '@/components/screen-shell';

/** One of your past daily reports: its calls, followups and expenses, read-only. Needs a connection. */
export default function DcrReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScreenShell title="Daily report">
      <DcrSummary recordId={String(id)} canAct={false} />
    </ScreenShell>
  );
}
