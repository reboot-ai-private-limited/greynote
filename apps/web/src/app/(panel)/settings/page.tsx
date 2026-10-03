import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SettingsScreen } from '@/features/settings/components/SettingsScreen';

// The screen reads `useSearchParams`, which needs a Suspense boundary to prerender.
export default function SettingsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <SettingsScreen />
    </Suspense>
  );
}
