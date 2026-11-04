'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useDeleteStockCounts } from '@/features/reports/hooks/useEmployeeSales';
import { useSession } from '@/lib/auth/SessionProvider';
import { useStockCountsMonth } from '../hooks/usePreviews';
import { PreviewFrame } from './PreviewFrame';
import { DistributorCountTables } from './StockCountTables';

/** A month of one employee's distributor counts, distributor by distributor: what the manager is asked to approve. Admin may delete the month. */
export function StockCountsPreview({ recordId }: { recordId: string }) {
  const [userId = '', month = ''] = recordId.split(':');
  const query = useStockCountsMonth(userId, month);
  const router = useRouter();
  const { user: me } = useSession();
  const [deleting, setDeleting] = useState(false);
  // The request goes with the month, so there is nothing left to decide here: back to the queue.
  const remove = useDeleteStockCounts(() => {
    setDeleting(false);
    router.push('/approvals?kind=STOCK_COUNT');
  });
  const distributors = query.data?.distributors ?? [];
  const lineCount = distributors.reduce((n, d) => n + d.lines.length, 0);
  return (
    <PreviewFrame
      title="Distributor stock counts"
      description="Secondary is opening + delivered − closing. Only approved counts count toward the employee's targets."
      query={query}
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted">
            <EmployeeName userId={userId} /> · {month ? monthLabel(month) : ''}
          </p>
          {me?.role === 'ADMIN' ? (
            <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden className="size-4" />
              Delete month
            </Button>
          ) : null}
        </div>
        <DistributorCountTables distributors={distributors} />
        {distributors.length === 0 ? (
          <p className="text-sm text-text-muted">No counts in this month.</p>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${month ? monthLabel(month) : 'this month'}'s distributor counts?`}
        description={`This removes ${lineCount} count line${lineCount === 1 ? '' : 's'} across ${distributors.length} distributor${distributors.length === 1 ? '' : 's'} and this approval request. The employee can count and submit the month again. Orders and the distributor statements are not affected. It cannot be undone.`}
        confirmLabel="Delete month"
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ userId, month })}
      />
    </PreviewFrame>
  );
}
