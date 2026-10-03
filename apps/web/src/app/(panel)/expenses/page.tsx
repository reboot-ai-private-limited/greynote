import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ExpensesScreen } from '@/features/field-activity/components/ExpensesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ExpensesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ExpensesScreen />
    </Suspense>
  );
}
