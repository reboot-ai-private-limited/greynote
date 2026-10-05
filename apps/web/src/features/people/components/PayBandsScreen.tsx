'use client';

import type { PayBandDto } from '@greynote/contracts';
import { useState } from 'react';
import type { Column } from '@/components/ui/DataTable';
import { formatMoney } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { usePayBands } from '../hooks/useMasterData';
import { gradeRange } from '../lib/ctc';
import { EditButton } from './EditButton';
import { MasterDataFrame } from './MasterDataFrame';
import { PayBandFormDialog } from './PayBandFormDialog';

export function PayBandsScreen({ canWrite }: { canWrite: boolean }) {
  const readOnly = useIsReadOnly();
  const bands = usePayBands();
  const [form, setForm] = useState<{ band?: PayBandDto } | null>(null);

  const columns: readonly Column<PayBandDto>[] = [
    { key: 'name', header: 'Grade', render: (b) => <span className="font-medium">{b.name}</span> },
    { key: 'min', header: 'CTC min / yr', numeric: true, render: (b) => formatMoney(b.ctcMinAnnualPaise) },
    { key: 'avg', header: 'CTC avg / yr', numeric: true, render: (b) => formatMoney(gradeRange(b).avg) },
    { key: 'max', header: 'CTC max / yr', numeric: true, render: (b) => formatMoney(b.ctcMaxAnnualPaise) },
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
      title="Pay grades"
      description="Each grade sets the CTC range an employee on it can be paid, plus the TA rate and DA amounts. The CTC itself is set per employee, under Compensation."
      noun="pay grade"
      readOnly={readOnly || !canWrite}
      canCreate
      createHint=""
      onNew={() => setForm({})}
      query={bands}
      columns={columns}
      emptyDescription="Create a grade (G1, G2 … or any name) with its CTC range before putting employees on a pay grade."
    >
      {form ? <PayBandFormDialog band={form.band} all={bands.data ?? []} onClose={() => setForm(null)} /> : null}
    </MasterDataFrame>
  );
}
