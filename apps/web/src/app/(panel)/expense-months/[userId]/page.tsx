import { Suspense } from 'react';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ExpenseReviewScreen } from '@/features/field-activity/components/ExpenseReviewScreen';

export default async function ExpenseReviewPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <Suspense fallback={<SkeletonTable />}>
      <ExpenseReviewScreen userId={userId} />
    </Suspense>
  );
}
