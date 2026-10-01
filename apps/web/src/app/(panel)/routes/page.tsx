import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { RoutesScreen } from '@/features/territory/components/RoutesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function RoutesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <RoutesScreen />
    </Suspense>
  );
}
