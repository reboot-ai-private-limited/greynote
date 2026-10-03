import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { DistributorsScreen } from '@/features/field-master-data/components/DistributorsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function DistributorsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <DistributorsScreen />
    </Suspense>
  );
}
