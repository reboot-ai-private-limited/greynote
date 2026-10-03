import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmployeesScreen } from '@/features/people/components/EmployeesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function EmployeesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <EmployeesScreen />
    </Suspense>
  );
}
