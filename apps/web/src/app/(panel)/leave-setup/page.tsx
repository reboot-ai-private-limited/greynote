import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { LeaveSetupScreen } from '@/features/hr/components/LeaveSetupScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function LeaveSetupPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <LeaveSetupScreen />
    </Suspense>
  );
}
