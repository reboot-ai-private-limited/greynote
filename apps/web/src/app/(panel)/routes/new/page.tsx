import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { RouteCreateScreen } from '@/features/territory/components/RouteCreateScreen';

// The screen reads `useSearchParams` (`?from=`), which needs a Suspense boundary to prerender.
export default function NewRoutePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RouteCreateScreen />
    </Suspense>
  );
}
