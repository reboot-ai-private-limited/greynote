'use client';

import type { DesignationDto } from '@greynote/contracts';
import { useState } from 'react';
import type { Column } from '@/components/ui/DataTable';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDesignations } from '../hooks/useMasterData';
import { DESIGNATION_LABEL, unusedDesignationNames } from '../lib/masterData';
import { DesignationFormDialog } from './DesignationFormDialog';
import { EditButton } from './EditButton';
import { MasterDataFrame } from './MasterDataFrame';

export function DesignationsScreen() {
  const readOnly = useIsReadOnly();
  const designations = useDesignations();
  const [form, setForm] = useState<{ designation?: DesignationDto } | null>(null);
  const available = unusedDesignationNames(designations.data ?? []);
  const sorted = designations.data ? [...designations.data].sort((a, b) => a.level - b.level) : undefined;

  const columns: readonly Column<DesignationDto>[] = [
    { key: 'name', header: 'Designation', render: (d) => <span className="font-medium">{DESIGNATION_LABEL[d.name]}</span> },
    { key: 'level', header: 'Level', numeric: true, render: (d) => d.level },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (d) => <EditButton label={d.name} disabled={readOnly} onClick={() => setForm({ designation: d })} />,
    },
  ];

  return (
    <MasterDataFrame
      title="Designations"
      description="Ranks in the reporting chain. A lower level reports up to a higher one."
      noun="designation"
      readOnly={readOnly}
      canCreate={available.length > 0}
      createHint="All designations already exist."
      onNew={() => setForm({})}
      query={{ ...designations, data: sorted }}
      columns={columns}
      emptyDescription="Create MR, ASM, RSM, ZSM and NSM with their levels before adding employees."
    >
      {form ? (
        <DesignationFormDialog designation={form.designation} availableNames={available} onClose={() => setForm(null)} />
      ) : null}
    </MasterDataFrame>
  );
}
