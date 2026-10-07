import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { SalaryReportScreen } from '@/features/reports/components/SalaryReportScreen';

// The screen reads `useSearchParams` (view and month), which needs a Suspense boundary to prerender.
export default function SalaryReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SalaryReportScreen />
    </Suspense>
  );
}
