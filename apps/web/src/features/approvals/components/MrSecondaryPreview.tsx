'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useDeleteSecondaryMonth } from '@/features/reports/hooks/useEmployeeSales';
import { useSession } from '@/lib/auth/SessionProvider';
import { useSecondaryStockMonth } from '../hooks/usePreviews';
import { PreviewFrame } from './PreviewFrame';
import { SecondaryFiles } from '@/features/reports/components/SecondaryFiles';
import { SecondaryStockTables, TotalsLine } from './SecondaryStockTables';
import { EditSecondaryStockDialog } from './EditSecondaryStockDialog';

/** An MR's month of secondary sales, distributor by distributor and product: what their manager is asked to approve. A manager may correct it while it waits; Admin may delete the month. */
export function MrSecondaryPreview({ recordId }: { recordId: string }) {
  const [userId = '', month = ''] = recordId.split(':');
  const query = useSecondaryStockMonth(userId, month);
  const data = query.data && query.data.status !== 'NOT_ENTERED' ? query.data : null;
  const router = useRouter();
  const { user: me } = useSession();
  const [deleting, setDeleting] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  // A manager above the MR (or Admin) may correct figures while they wait for approval; the server checks who is above whom.
  const canCorrect = !!data && data.status === 'PENDING' && me?.id !== userId;
  // The request goes with the month, so there is nothing left to decide here: back to the queue.
  const remove = useDeleteSecondaryMonth(() => {
    setDeleting(false);
    router.push('/approvals?kind=SECONDARY_SALES');
  });
  const lineCount = data?.distributors.reduce((n, d) => n + d.lines.filter((l) => l.saved).length, 0) ?? 0;
  const distributorCount = data?.distributors.filter((d) => d.lines.some((l) => l.saved)).length ?? 0;
  return (
    <PreviewFrame title="Secondary sales" description="Closing is opening + primary − secondary. Only approved figures count toward achievement." query={query}>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted">
            <EmployeeName userId={userId} /> · {month ? monthLabel(month) : ''}
          </p>
          {canCorrect ? (
            <Button variant="secondary" size="sm" onClick={() => setCorrecting(true)}>
              <Pencil aria-hidden className="size-4" />
              Correct figures
            </Button>
          ) : null}
          {me?.role === 'ADMIN' ? (
            <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden className="size-4" />
              Delete month
            </Button>
          ) : null}
        </div>
        {data ? (
          <>
            <SecondaryStockTables distributors={data.distributors} />
            <TotalsLine totals={data.totals} />
            <SecondaryFiles files={data.attachments} userId={userId} month={month} isSelf={false} canEdit={false} />
            <p className="text-xs text-text-subtle">* differs from the suggested figure (last approved closing, or the MR&apos;s Done orders).</p>
          </>
        ) : (
          <p className="text-sm text-text-muted">No figures in this month.</p>
        )}
      </div>
      {correcting && data ? <EditSecondaryStockDialog data={data} onClose={() => setCorrecting(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${month ? monthLabel(month) : 'this month'}'s secondary sales?`}
        description={`This removes ${lineCount} line${lineCount === 1 ? '' : 's'} across ${distributorCount} distributor${distributorCount === 1 ? '' : 's'}, the attached files and this approval request. The employee can enter and submit the month again. Orders and the distributor statements are not affected. It cannot be undone.`}
        confirmLabel="Delete month"
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ userId, month })}
      />
    </PreviewFrame>
  );
}
