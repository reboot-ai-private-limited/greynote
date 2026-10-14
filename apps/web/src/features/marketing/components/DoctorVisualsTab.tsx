'use client';

import type { DoctorVisualDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FilePreviewDialog } from '@/components/ui/FilePreviewDialog';
import { FileThumb } from '@/components/ui/FileThumb';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { Select } from '@/components/ui/Select';
import { useAddDoctorVisual, useDoctorVisuals, useRemoveDoctorVisual, useVisuals } from '../hooks/useVisuals';
import { visualKind, visualPreviewKind } from '../lib/visuals';

/**
 * The visuals shown to this doctor. The MR only adds, from the app; a manager above them or Admin can add, take off, and so edit the list — here
 * (Admin) or in the app (managers).
 */
export function DoctorVisualsTab({ doctorId }: { doctorId: string }) {
  const readOnly = useIsReadOnly();
  const list = useDoctorVisuals(doctorId);
  const [preview, setPreview] = useState<DoctorVisualDto['visual'] | null>(null);
  const [removing, setRemoving] = useState<DoctorVisualDto | null>(null);
  const remove = useRemoveDoctorVisual(doctorId, () => setRemoving(null));
  const canRemove = (list.data?.canRemove ?? false) && !readOnly;
  const library = useVisuals({ status: 'active' });
  const [picking, setPicking] = useState('');
  const add = useAddDoctorVisual(doctorId, () => setPicking(''));
  const picked = new Set((list.data?.items ?? []).map((r) => r.visual.id));
  const options = (library.data ?? []).filter((v) => !picked.has(v.id)).map((v) => ({ value: v.id, label: v.title }));

  const columns: readonly Column<DoctorVisualDto>[] = [
    {
      key: 'visual',
      header: 'Visual',
      render: (r) => (
        <div className="flex items-center gap-3">
          <FileThumb title={r.visual.title} url={r.visual.fileUrl} kind={visualPreviewKind(r.visual.mimeType)} onOpen={() => setPreview(r.visual)} />
          <div>
            <button
              type="button"
              onClick={() => setPreview(r.visual)}
              className="text-left font-medium hover:text-accent hover:underline"
            >
              {r.visual.title}
            </button>
            <p className="text-xs text-text-subtle">{visualKind(r.visual.mimeType)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Library status',
      render: (r) => (
        <Badge tone={r.visual.status === 'active' ? 'success' : 'neutral'}>
          {r.visual.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    { key: 'addedBy', header: 'Added by', render: (r) => r.addedByName ?? '—' },
    {
      key: 'addedAt',
      header: 'Added on',
      render: (r) =>
        new Date(r.addedAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
    },
    ...(canRemove
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-24 text-right',
            render: (r: DoctorVisualDto) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRemoving(r)}
                aria-label={`Take ${r.visual.title} off this doctor`}
              >
                Remove
              </Button>
            ),
          } satisfies Column<DoctorVisualDto>,
        ]
      : []),
  ];

  return (
    <>
      <Card
        flat
        title="Visuals shown to this doctor"
        description="Chosen by the doctor's MR in the app. An MR can only add; managers above them and Admin can add and take off."
      >
        {canRemove ? (
          <div className="flex items-end gap-2 px-5 pt-4">
            <div className="w-72">
              <Select aria-label="Visual to add" value={picking} onValueChange={setPicking} options={options} placeholder={options.length ? 'Choose a visual to add' : 'Every active visual is already picked'} />
            </div>
            <Button disabled={!picking || add.isPending} onClick={() => add.mutate(picking)}>
              Add
            </Button>
          </div>
        ) : null}
        <DataState
          isLoading={list.isLoading}
          error={list.error ? toErrorState(list.error, () => void list.refetch()) : null}
          isEmpty={list.data?.items.length === 0}
          empty={{
            title: 'Nothing picked yet',
            description: 'The MR picks visuals for this doctor in the Visuals tab of the app.',
          }}
        >
          <DataTable
            columns={columns}
            rows={list.data?.items ?? []}
            rowKey={(r) => r.visual.id}
            bleed={false}
          />
        </DataState>
      </Card>
      <FilePreviewDialog file={preview ? { title: preview.title, url: preview.fileUrl, kind: visualPreviewKind(preview.mimeType) } : null} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Take this visual off the doctor?"
        description={
          removing
            ? `“${removing.visual.title}” leaves this doctor's list. The MR can add it again.`
            : undefined
        }
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.visual.id)}
      />
    </>
  );
}
