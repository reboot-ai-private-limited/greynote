import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmployeeSetupScreen } from '@/features/people/components/EmployeeSetupScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default async function EmployeeSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <EmployeeSetupScreen id={id} />
    </Suspense>
  );
}
