import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { TerritoryTreeScreen } from '@/features/territory/components/TerritoryTreeScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function TerritoryPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <TerritoryTreeScreen />
    </Suspense>
  );
}
