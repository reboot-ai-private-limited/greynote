import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ProductsScreen } from '@/features/field-master-data/components/ProductsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function ProductsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ProductsScreen />
    </Suspense>
  );
}
