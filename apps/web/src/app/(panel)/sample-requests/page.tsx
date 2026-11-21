import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SampleRequestsScreen } from '@/features/field-activity/components/SampleRequestsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function SampleRequestsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <SampleRequestsScreen />
    </Suspense>
  );
}
