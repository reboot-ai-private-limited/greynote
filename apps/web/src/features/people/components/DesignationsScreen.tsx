'use client';

import type { DesignationDto } from '@greynote/contracts';
import { useState } from 'react';
import type { Column } from '@/components/ui/DataTable';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDesignations } from '../hooks/useMasterData';
import { DESIGNATION_LABEL, unusedDesignationNames } from '../lib/masterData';
import { DesignationFormDialog } from './DesignationFormDialog';
import { MasterDataFrame } from './MasterDataFrame';

export function DesignationsScreen() {
  const readOnly = useIsReadOnly();
  const designations = useDesignations();
  const [creating, setCreating] = useState(false);
  const available = unusedDesignationNames(designations.data ?? []);
  const sorted = designations.data ? [...designations.data].sort((a, b) => a.level - b.level) : undefined;

  const columns: readonly Column<DesignationDto>[] = [
    { key: 'name', header: 'Designation', render: (d) => <span className="font-medium">{DESIGNATION_LABEL[d.name]}</span> },
    { key: 'level', header: 'Level', numeric: true, render: (d) => d.level },
  ];

  return (
    <MasterDataFrame
      title="Designations"
      description="Ranks in the reporting chain, fixed by the name: MR 1, ASM 2, RSM 3, ZSM 4, NSM 5. A lower level reports up to a higher one."
      noun="designation"
      readOnly={readOnly}
      canCreate={available.length > 0}
      createHint="All designations already exist."
      onNew={() => setCreating(true)}
      query={{ ...designations, data: sorted }}
      columns={columns}
      emptyDescription="Add MR, ASM, RSM, ZSM and NSM before putting employees on a designation."
    >
      {creating ? <DesignationFormDialog availableNames={available} onClose={() => setCreating(false)} /> : null}
    </MasterDataFrame>
  );
}
