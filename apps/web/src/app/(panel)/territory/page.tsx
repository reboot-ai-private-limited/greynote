import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { TerritoryScreen } from '@/features/territory/components/TerritoryScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function Page() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <TerritoryScreen />
    </Suspense>
  );
}
