import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { InvoicesScreen } from '@/features/invoices/components/InvoicesScreen';

// The screen reads `useSearchParams` (month, status), which needs a Suspense boundary to prerender.
export default function InvoicesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InvoicesScreen />
    </Suspense>
  );
}
