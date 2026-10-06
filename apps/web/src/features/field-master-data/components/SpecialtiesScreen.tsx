'use client';

import type { MasterStatus, SpecialtyDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { RowActions } from '@/components/ui/RowActions';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useSpecialties, useUpdateSpecialty } from '../hooks/useSpecialties';
import { SpecialtyFormDialog } from './SpecialtyFormDialog';

/** The specialities a doctor can have. A deactivated one is no longer offered for new choices; doctors who have it keep it. */
export function SpecialtiesScreen() {
  const { values, page, update } = useFilterParams(['search', 'status']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const [form, setForm] = useState<{ specialty?: SpecialtyDto } | null>(null);
  const [toggling, setToggling] = useState<SpecialtyDto | null>(null);
  const updateSpecialty = useUpdateSpecialty(() => setToggling(null));

  const specialties = useSpecialties({
    page,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as MasterStatus }),
  });

  const columns: readonly Column<SpecialtyDto>[] = [
    { key: 'name', header: 'Speciality', render: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <Badge tone={s.status === 'active' ? 'success' : 'neutral'}>{s.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (s) => <RowActions label={s.name} status={s.status} disabled={readOnly} onEdit={() => setForm({ specialty: s })} onToggleStatus={() => setToggling(s)} />,
    },
  ];

  return (
    <PagedListFrame
      title="Specialities"
      description="The list a doctor's speciality is chosen from. Renaming one renames it on its doctors; deactivating one only stops it being offered."
      noun="speciality"
      readOnly={readOnly}
      onNew={() => setForm({})}
      filters={
        <>
          <Input placeholder="Search by name" aria-label="Search specialities" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={specialties}
      columns={columns}
      emptyDescription="No speciality matches these filters."
      onPageChange={(p) => update({ page: p })}
    >
      {form ? <SpecialtyFormDialog specialty={form.specialty} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling}
        noun="speciality"
        pending={updateSpecialty.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateSpecialty.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
