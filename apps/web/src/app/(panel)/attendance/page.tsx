import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { PayrollCalendarScreen } from '@/features/attendance/components/PayrollCalendarScreen';

// The screen reads `useSearchParams` (the month), which needs a Suspense boundary to prerender.
export default function AttendancePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PayrollCalendarScreen />
    </Suspense>
  );
}
