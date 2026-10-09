import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { SalesDashboardScreen } from '@/features/reports/components/SalesDashboardScreen';

// The screen reads `useSearchParams` (range, search, page), which needs a Suspense boundary to prerender.
export default function SalesDashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SalesDashboardScreen />
    </Suspense>
  );
}
