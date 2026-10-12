'use client';

import type { EmployeeSalesLineDto } from '@greynote/contracts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { formatMoney } from '@/lib/format';
import { useSecondaryMonth } from '../hooks/usePreviews';
import { PreviewFrame } from './PreviewFrame';

const COLUMNS: readonly Column<EmployeeSalesLineDto>[] = [
  { key: 'product', header: 'Product', render: (l) => <span className="font-medium">{l.product.name}</span> },
  { key: 'qty', header: 'Units', numeric: true, render: (l) => l.secondaryQty },
  { key: 'amount', header: 'Amount at PTR', numeric: true, render: (l) => (l.secondaryAmountPaise === null ? '—' : formatMoney(l.secondaryAmountPaise)) },
];

/** A month of one employee's secondary, product by product, as sent: what the manager is asked to approve. */
export function SecondarySalesPreview({ recordId }: { recordId: string }) {
  const [userId = '', month = ''] = recordId.split(':');
  const query = useSecondaryMonth(userId, month);
  const lines = (query.data?.lines ?? []).filter((l) => l.secondaryQty !== null);
  return (
    <PreviewFrame title="Monthly secondary" description="Only approved secondary counts toward the employee's targets." query={query}>
      <div className="space-y-2 p-5">
        <p className="text-sm text-text-muted">
          <EmployeeName userId={userId} /> · {month ? monthLabel(month) : ''}
        </p>
        <DataTable columns={COLUMNS} rows={lines} rowKey={(l) => l.product.id} bleed={false} />
      </div>
    </PreviewFrame>
  );
}
