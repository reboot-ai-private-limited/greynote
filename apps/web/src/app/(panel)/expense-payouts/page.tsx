import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ExpensePayoutsScreen } from '@/features/field-activity/components/ExpensePayoutsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ExpensePayoutsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ExpensePayoutsScreen />
    </Suspense>
  );
}
