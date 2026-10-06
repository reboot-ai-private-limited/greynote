import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SpecialtiesScreen } from '@/features/field-master-data/components/SpecialtiesScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function SpecialtiesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <SpecialtiesScreen />
    </Suspense>
  );
}
