import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { SecondaryReportScreen } from '@/features/reports/components/SecondaryReportScreen';

export default function SecondaryReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SecondaryReportScreen />
    </Suspense>
  );
}
