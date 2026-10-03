import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { DoctorsScreen } from '@/features/field-master-data/components/DoctorsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function DoctorsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <DoctorsScreen />
    </Suspense>
  );
}
