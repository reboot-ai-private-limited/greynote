import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { PayrollScreen } from '@/features/payroll/components/PayrollScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function PayrollPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <PayrollScreen />
    </Suspense>
  );
}
