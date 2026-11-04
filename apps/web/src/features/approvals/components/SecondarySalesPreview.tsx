'use client';

import type { EmployeeSalesLineDto, StockCountsMonthDto } from '@greynote/contracts';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useSession } from '@/lib/auth/SessionProvider';
import { formatMoney } from '@/lib/format';
import { useSecondaryMonth, useStockCountsMonth } from '../hooks/usePreviews';
import { DistributorCountTables, totalsByProduct } from './StockCountTables';
import { SecondaryFiles } from '@/features/reports/components/SecondaryFiles';
import { useDeleteSecondary } from '@/features/reports/hooks/useEmployeeSales';
import { PreviewFrame } from './PreviewFrame';

const COLUMNS: readonly Column<EmployeeSalesLineDto>[] = [
  {
    key: 'product',
    header: 'Product',
    render: (l) => <span className="font-medium">{l.product.name}</span>,
  },
  { key: 'qty', header: 'Units', numeric: true, render: (l) => l.secondaryQty },
  {
    key: 'amount',
    header: 'Amount at PTS',
    numeric: true,
    render: (l) => (l.secondaryAmountPaise === null ? '—' : formatMoney(l.secondaryAmountPaise)),
  },
];

/** A month of one employee's secondary, product by product, as sent: what the manager is asked to approve. */
export function SecondarySalesPreview({ recordId }: { recordId: string }) {
  const [userId = '', month = ''] = recordId.split(':');
  const query = useSecondaryMonth(userId, month);
  const router = useRouter();
  const { user: me } = useSession();
  const counts = useStockCountsMonth(userId, month);
  const [deleting, setDeleting] = useState(false);
  // The request goes with the month, so there is nothing left to decide here: back to the queue.
  const remove = useDeleteSecondary(() => {
    setDeleting(false);
    router.push('/approvals?kind=SECONDARY_SALES');
  });
  const lines = (query.data?.lines ?? []).filter((l) => l.secondaryQty !== null);
  // The manager above or Admin may correct the figures before deciding (Admin may also delete the month there); the grid is on the employee's page.
  const canEdit = (me?.role === 'ADMIN' || me?.role === 'FIELD') && me.id !== userId;
  return (
    <PreviewFrame
      title="Monthly secondary"
      description="The employee's own record. Targets are counted from their distributors' approved stock counts."
      query={query}
    >
      <div className="space-y-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted">
            <EmployeeName userId={userId} /> · {month ? monthLabel(month) : ''}
          </p>
          {canEdit ? (
            <span className="flex gap-2">
              {me?.role === 'ADMIN' ? (
                <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
                  <Trash2 aria-hidden className="size-4" />
                  Delete month
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/reports/sales-dashboard/${userId}?month=${month}`)}
              >
                <Pencil aria-hidden className="size-4" />
                Edit figures
              </Button>
            </span>
          ) : null}
        </div>
        <DataTable columns={COLUMNS} rows={lines} rowKey={(l) => l.product.id} bleed={false} />
        <CountsReview entered={lines} counts={counts.data} loading={counts.isLoading} />
        <SecondaryFiles
          files={query.data?.attachments ?? []}
          userId={userId}
          month={month}
          isSelf={false}
          canEdit={false}
        />
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${month ? monthLabel(month) : 'this month'}'s secondary?`}
        description={`This removes all ${lines.length} product figure${lines.length === 1 ? '' : 's'}, ${query.data?.attachments?.length ?? 0} file${(query.data?.attachments?.length ?? 0) === 1 ? '' : 's'} and this approval request. The employee can enter and submit the month again. Admin's change to the primary stays. It cannot be undone.`}
        confirmLabel="Delete month"
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ userId, month })}
      />
    </PreviewFrame>
  );
}

/** What the employee typed against what their distributor counts work out to, product by product, and the counts themselves, distributor by distributor. */
function CountsReview({
  entered,
  counts,
  loading,
}: {
  entered: readonly EmployeeSalesLineDto[];
  counts: StockCountsMonthDto | undefined;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-text-muted">Loading their distributor counts…</p>;
  const distributors = counts?.distributors ?? [];
  if (distributors.length === 0)
    return (
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">
        This employee has no distributor counts for the month to compare with.
      </p>
    );
  const counted = new Map(totalsByProduct(distributors).map((t) => [t.id, t]));
  const typed = new Map(entered.map((l) => [l.product.id, l]));
  const ids = [...new Set([...typed.keys(), ...counted.keys()])];
  const rows: ComparisonRow[] = ids
    .map((id) => ({
      id,
      name: typed.get(id)?.product.name ?? counted.get(id)?.name ?? '',
      entered: typed.get(id)?.secondaryQty ?? null,
      counted: counted.get(id)?.qty ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="space-y-1.5">
        <h3 className="text-[13px] font-semibold text-text">
          Typed against distributor counts, per product
        </h3>
        <p className="text-[12px] text-text-muted">
          “From counts” is opening + delivered − closing, added over the employee&apos;s
          distributors (any status). A difference is worth a question before approving.
        </p>
        <DataTable columns={COMPARISON} rows={rows} rowKey={(r) => r.id} bleed={false} />
      </div>
      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold text-text">Distributor counts, per distributor</h3>
        <DistributorCountTables distributors={distributors} />
      </div>
    </div>
  );
}

interface ComparisonRow {
  id: string;
  name: string;
  entered: number | null;
  counted: number | null;
}

const COMPARISON: readonly Column<ComparisonRow>[] = [
  {
    key: 'product',
    header: 'Product',
    render: (r) => <span className="font-medium">{r.name}</span>,
  },
  { key: 'entered', header: 'Typed', numeric: true, render: (r) => r.entered ?? '—' },
  { key: 'counted', header: 'From counts', numeric: true, render: (r) => r.counted ?? '—' },
  {
    key: 'diff',
    header: 'Difference',
    numeric: true,
    render: (r) => {
      if (r.entered === null || r.counted === null) return '—';
      const d = r.entered - r.counted;
      return d === 0 ? (
        '0'
      ) : (
        <span className="font-medium text-warning-fg">{d > 0 ? `+${d}` : d}</span>
      );
    },
  },
];
