import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { AreasScreen } from '@/features/territory/components/AreasScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function Page() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <AreasScreen />
    </Suspense>
  );
}
