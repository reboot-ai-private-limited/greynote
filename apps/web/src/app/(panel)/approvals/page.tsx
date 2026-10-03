import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ApprovalsScreen } from '@/features/approvals/components/ApprovalsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ApprovalsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ApprovalsScreen />
    </Suspense>
  );
}
