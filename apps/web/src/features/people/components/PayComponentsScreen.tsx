'use client';

import type { PayComponentDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { formatMoney } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { usePayComponents } from '../hooks/useCtc';
import { KIND_LABEL, ruleSummary } from '../lib/ctc';
import { EditButton } from './EditButton';
import { MasterDataFrame } from './MasterDataFrame';
import { PayComponentFormDialog } from './PayComponentFormDialog';
import { ReapplyCtcDialog } from './ReapplyCtcDialog';

/** The one formula every employee's CTC is split by. Admin/HR edit it; the Accountant reads it. */
export function PayComponentsScreen({ canWrite }: { canWrite: boolean }) {
  const readOnly = useIsReadOnly();
  const components = usePayComponents();
  const [form, setForm] = useState<{ component?: PayComponentDto } | null>(null);
  const [reapplying, setReapplying] = useState(false);
  const all = components.data ?? [];
  const names = new Map(all.map((c) => [c.code, c.name]));

  const columns: readonly Column<PayComponentDto>[] = [
    { key: 'name', header: 'Component', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'code', header: 'Code', render: (c) => <span className="text-text-muted">{c.code}</span> },
    { key: 'rule', header: 'Worked out as', render: (c) => ruleSummary(c.rule, names, formatMoney) },
    { key: 'kind', header: 'Kind', render: (c) => KIND_LABEL[c.kind] },
    { key: 'status', header: 'Status', render: (c) => (c.isActive ? <Badge tone="success">In use</Badge> : <Badge>Not in use</Badge>) },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-12 text-right',
            render: (c: PayComponentDto) => <EditButton label={c.name} disabled={readOnly} onClick={() => setForm({ component: c })} />,
          },
        ]
      : []),
  ];

  return (
    <>
      <MasterDataFrame
        title="Pay components"
        description="How every employee's CTC is split: Basic, FDA, EPF, ESI, Medical and the allowances. The balancer takes the rest. Each employee's own CTC is set under Compensation."
        noun="component"
        readOnly={readOnly || !canWrite}
        canCreate
        createHint=""
        onNew={() => setForm({})}
        query={components}
        columns={columns}
        emptyDescription="Run the seed to create the starting formula, or add components here."
      >
        {canWrite ? (
          <div className="mt-4 flex items-center justify-between gap-4 text-sm text-text-muted">
            <p>Changing the formula does not change CTCs already saved. Re-apply it to bring employees onto the new rules.</p>
            <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setReapplying(true)}>
              Re-apply to employees
            </Button>
          </div>
        ) : null}
      </MasterDataFrame>
      {form ? <PayComponentFormDialog component={form.component} all={all} onClose={() => setForm(null)} /> : null}
      {reapplying ? <ReapplyCtcDialog onClose={() => setReapplying(false)} /> : null}
    </>
  );
}
