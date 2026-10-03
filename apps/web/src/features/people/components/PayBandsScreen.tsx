'use client';

import type { PayBandDto } from '@greynote/contracts';
import { useState } from 'react';
import type { Column } from '@/components/ui/DataTable';
import { formatMoney } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { usePayBands } from '../hooks/useMasterData';
import { unusedPayBandNames } from '../lib/masterData';
import { EditButton } from './EditButton';
import { MasterDataFrame } from './MasterDataFrame';
import { PayBandFormDialog } from './PayBandFormDialog';

export function PayBandsScreen({ canWrite }: { canWrite: boolean }) {
  const readOnly = useIsReadOnly();
  const bands = usePayBands();
  const [form, setForm] = useState<{ band?: PayBandDto } | null>(null);
  const available = unusedPayBandNames(bands.data ?? []);

  const columns: readonly Column<PayBandDto>[] = [
    { key: 'name', header: 'Grade', render: (b) => <span className="font-medium">{b.name}</span> },
    { key: 'base', header: 'Base salary', numeric: true, render: (b) => formatMoney(b.baseSalaryPaise) },
    { key: 'ta', header: 'TA / km', numeric: true, render: (b) => formatMoney(b.taPerKmRatePaise) },
    { key: 'hq', header: 'DA · HQ', numeric: true, render: (b) => formatMoney(b.hqDaPaise) },
    { key: 'ex', header: 'DA · Ex-station', numeric: true, render: (b) => formatMoney(b.exStationDaPaise) },
    { key: 'out', header: 'DA · Out-station', numeric: true, render: (b) => formatMoney(b.outStationDaPaise) },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-12 text-right',
            render: (b: PayBandDto) => <EditButton label={`grade ${b.name}`} disabled={readOnly} onClick={() => setForm({ band: b })} />,
          },
        ]
      : []),
  ];

  return (
    <MasterDataFrame
      title="Pay Bands"
      description="Base salary, TA rate and DA amounts per grade. Employees on a grade earn at these rates."
      noun="pay band"
      readOnly={readOnly || !canWrite}
      canCreate={available.length > 0}
      createHint="All grades already exist."
      onNew={() => setForm({})}
      query={bands}
      columns={columns}
      emptyDescription="Create a grade (G1, G2, G3) before putting employees on a pay band."
    >
      {form ? <PayBandFormDialog band={form.band} availableNames={available} onClose={() => setForm(null)} /> : null}
    </MasterDataFrame>
  );
}
