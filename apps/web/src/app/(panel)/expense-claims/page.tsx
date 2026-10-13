import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ExpensesScreen } from '@/features/field-activity/components/ExpensesScreen';

// The row-by-row list of claims (what the old Expenses page was); the month table is now Expenses.
// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ExpenseClaimsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ExpensesScreen />
    </Suspense>
  );
}
