'use client';

import type { EmployeeSalesLineDto } from '@greynote/contracts';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useSession } from '@/lib/auth/SessionProvider';
import { formatMoney } from '@/lib/format';
import { useSecondaryMonth } from '../hooks/usePreviews';
import { SecondaryFiles } from '@/features/reports/components/SecondaryFiles';
import { PreviewFrame } from './PreviewFrame';

const COLUMNS: readonly Column<EmployeeSalesLineDto>[] = [
  { key: 'product', header: 'Product', render: (l) => <span className="font-medium">{l.product.name}</span> },
  { key: 'qty', header: 'Units', numeric: true, render: (l) => l.secondaryQty },
  { key: 'amount', header: 'Amount at PTS', numeric: true, render: (l) => (l.secondaryAmountPaise === null ? '—' : formatMoney(l.secondaryAmountPaise)) },
];

/** A month of one employee's secondary, product by product, as sent: what the manager is asked to approve. */
export function SecondarySalesPreview({ recordId }: { recordId: string }) {
  const [userId = '', month = ''] = recordId.split(':');
  const query = useSecondaryMonth(userId, month);
  const router = useRouter();
  const { user: me } = useSession();
  const lines = (query.data?.lines ?? []).filter((l) => l.secondaryQty !== null);
  // The manager above or Admin may correct the figures before deciding (Admin may also delete the month there); the grid is on the employee's page.
  const canEdit = (me?.role === 'ADMIN' || me?.role === 'FIELD') && me.id !== userId;
  return (
    <PreviewFrame title="Monthly secondary" description="Only approved secondary counts toward the employee's targets." query={query}>
      <div className="space-y-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted">
            <EmployeeName userId={userId} /> · {month ? monthLabel(month) : ''}
          </p>
          {canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => router.push(`/reports/sales-dashboard/${userId}?month=${month}`)}>
              <Pencil aria-hidden className="size-4" />
              Edit figures
            </Button>
          ) : null}
        </div>
        <DataTable columns={COLUMNS} rows={lines} rowKey={(l) => l.product.id} bleed={false} />
        <SecondaryFiles files={query.data?.attachments ?? []} userId={userId} month={month} isSelf={false} canEdit={false} />
      </div>
    </PreviewFrame>
  );
}
