import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ChemistsScreen } from '@/features/field-master-data/components/ChemistsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ChemistsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ChemistsScreen />
    </Suspense>
  );
}
