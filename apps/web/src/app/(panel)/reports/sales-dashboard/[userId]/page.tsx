import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmployeeSalesScreen } from '@/features/reports/components/EmployeeSalesScreen';

// The screen reads `useSearchParams` (period, months), which needs a Suspense boundary to prerender.
export default async function EmployeeSalesPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <EmployeeSalesScreen userId={userId} />
    </Suspense>
  );
}
