import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { DoctorVisitsScreen } from '@/features/reports/components/DoctorVisitsScreen';

// The screen reads `useSearchParams` (the month), which needs a Suspense boundary to prerender.
export default function DoctorVisitsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DoctorVisitsScreen />
    </Suspense>
  );
}
