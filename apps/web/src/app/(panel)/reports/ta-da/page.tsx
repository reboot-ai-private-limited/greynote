import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { TaDaReportScreen } from '@/features/reports/components/TaDaReportScreen';

// The screen reads `useSearchParams` (the month), which needs a Suspense boundary to prerender.
export default function TaDaReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TaDaReportScreen />
    </Suspense>
  );
}
