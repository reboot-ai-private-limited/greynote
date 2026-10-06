import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { DoctorGiftsScreen } from '@/features/field-activity/components/DoctorGiftsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function DoctorGiftsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <DoctorGiftsScreen />
    </Suspense>
  );
}
