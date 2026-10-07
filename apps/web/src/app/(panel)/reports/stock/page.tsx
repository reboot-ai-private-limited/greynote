import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { StockReportScreen } from '@/features/reports/components/StockReportScreen';

export default function StockReportPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StockReportScreen />
    </Suspense>
  );
}
