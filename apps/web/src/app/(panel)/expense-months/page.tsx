import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ExpenseMonthsScreen } from '@/features/field-activity/components/ExpenseMonthsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ExpenseMonthsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ExpenseMonthsScreen />
    </Suspense>
  );
}
