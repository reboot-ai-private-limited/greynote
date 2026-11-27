import { Suspense } from 'react';
import { CallPerformanceScreen } from '@/features/reports/components/CallPerformanceScreen';

export default function CallPerformancePage() {
  return (
    <Suspense>
      <CallPerformanceScreen />
    </Suspense>
  );
}
