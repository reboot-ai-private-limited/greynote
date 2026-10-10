'use client';

import type { DoctorVisualDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDoctorVisuals, useRemoveDoctorVisual } from '../hooks/useVisuals';
import { visualKind } from '../lib/visuals';

/** The visuals the doctor's MR chose to show this doctor. The MR only adds, from the app; Admin can take a pick off here. */
export function DoctorVisualsTab({ doctorId }: { doctorId: string }) {
  const readOnly = useIsReadOnly();
  const list = useDoctorVisuals(doctorId);
  const [removing, setRemoving] = useState<DoctorVisualDto | null>(null);
  const remove = useRemoveDoctorVisual(doctorId, () => setRemoving(null));
  const canRemove = (list.data?.canRemove ?? false) && !readOnly;

  const columns: readonly Column<DoctorVisualDto>[] = [
    {
      key: 'visual',
      header: 'Visual',
      render: (r) => (
        <div>
          <a
            href={r.visual.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-accent hover:underline"
          >
            {r.visual.title}
          </a>
          <p className="text-xs text-text-subtle">{visualKind(r.visual.mimeType)}</p>
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
        description="Chosen by the doctor's MR in the app. An MR can only add; removing is for managers and Admin."
      >
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
