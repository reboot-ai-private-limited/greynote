'use client';

import type { VisualDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDeleteVisual, useVisualDeleteImpact } from '../hooks/useVisuals';

/** The warning before a visual is deleted for good: how many doctors have it on their list. It warns, it does not block. */
export function DeleteVisualDialog({
  visual,
  onClose,
}: {
  visual: VisualDto | null;
  onClose: () => void;
}) {
  const impact = useVisualDeleteImpact(visual?.id ?? null);
  const remove = useDeleteVisual(onClose);
  const doctors = impact.data?.doctors ?? 0;

  return (
    <Dialog
      open={visual !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Delete visual permanently"
      description={
        visual
          ? `“${visual.title}” and its image will be removed for good. This cannot be undone.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!impact.data || remove.isPending}
            onClick={() => visual && remove.mutate(visual.id)}
          >
            {remove.isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </>
      }
    >
      {impact.isLoading ? (
        <p className="text-[13px] text-text-subtle">Checking where it is used…</p>
      ) : impact.error ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {toErrorState(impact.error).message}
        </p>
      ) : (
        <p className="text-sm text-text-muted">
          {doctors > 0
            ? `It is on ${doctors} ${doctors === 1 ? 'doctor’s list' : 'doctors’ lists'} and will be taken off ${doctors === 1 ? 'it' : 'them'}.`
            : 'It is not on any doctor’s list.'}{' '}
          To only hide it from MRs, deactivate it instead.
        </p>
      )}
    </Dialog>
  );
}
