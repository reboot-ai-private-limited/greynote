import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { HqsScreen } from '@/features/territory/components/HqsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function Page() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <HqsScreen />
    </Suspense>
  );
}
