import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { DcrReportScreen } from '@/features/reports/components/DcrReportScreen';

// The screen reads `useSearchParams` (the month), which needs a Suspense boundary to prerender.
export default function DcrReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DcrReportScreen />
    </Suspense>
  );
}
