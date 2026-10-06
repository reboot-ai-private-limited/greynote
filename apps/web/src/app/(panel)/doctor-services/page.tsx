import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { DoctorServicesScreen } from '@/features/field-activity/components/DoctorServicesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function DoctorServicesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <DoctorServicesScreen />
    </Suspense>
  );
}
