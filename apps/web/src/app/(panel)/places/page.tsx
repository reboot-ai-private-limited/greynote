import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { PlacesScreen } from '@/features/territory/components/PlacesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function Page() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <PlacesScreen />
    </Suspense>
  );
}
