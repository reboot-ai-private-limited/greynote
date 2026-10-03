import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { HrScreen } from '@/features/hr/components/HrScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function HrPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <HrScreen />
    </Suspense>
  );
}
