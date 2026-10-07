import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { SalesReportScreen } from '@/features/reports/components/SalesReportScreen';

// The screen reads `useSearchParams` (month, filters), which needs a Suspense boundary to prerender.
export default function SalesReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SalesReportScreen />
    </Suspense>
  );
}
