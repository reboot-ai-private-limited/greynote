import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrdersScreen } from '@/features/reports/components/OrdersScreen';

// The screen reads `useSearchParams` (month, tab, filters), which needs a Suspense boundary to prerender.
export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <OrdersScreen />
    </Suspense>
  );
}
