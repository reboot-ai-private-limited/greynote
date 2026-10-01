import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ZonesScreen } from '@/features/territory/components/ZonesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ZonesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ZonesScreen />
    </Suspense>
  );
}
