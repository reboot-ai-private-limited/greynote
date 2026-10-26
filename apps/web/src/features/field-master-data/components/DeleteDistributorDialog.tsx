'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDeleteDistributor, useDistributorImpact } from '../hooks/useDistributors';
import { distributorImpactLines } from '../lib/distributors';

/**
 * Permanently deleting a distributor, Admin only. Shows what goes with it — its payments, orders and stock are erased, not archived —
 * and keeps the red button off until the distributor's name is typed, so a mis-click cannot do it. Deactivating is the gentler way out.
 */
export function DeleteDistributorDialog({
  distributor,
  onClose,
  onDeleted,
}: {
  distributor: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [typed, setTyped] = useState('');
  const impact = useDistributorImpact(distributor?.id ?? null);
  const close = () => {
    setTyped('');
    onClose();
  };
  const remove = useDeleteDistributor(() => {
    close();
    onDeleted?.();
  });
  const confirmed = typed.trim().toLowerCase() === (distributor?.name ?? '').trim().toLowerCase() && typed.trim() !== '';
  const lines = impact.data ? distributorImpactLines(impact.data) : null;

  return (
    <Dialog
      open={distributor !== null}
      onOpenChange={(open) => !open && close()}
      title="Delete distributor permanently"
      description={distributor ? `“${distributor.name}” and its history will be erased for good. To stop using it but keep the history, deactivate it instead.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!impact.data || !confirmed || remove.isPending} onClick={() => distributor && remove.mutate(distributor.id)}>
            {remove.isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </>
      }
    >
      {impact.isLoading ? (
        <p className="text-[13px] text-text-subtle">Checking what this erases…</p>
      ) : impact.error ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {toErrorState(impact.error).message}
        </p>
      ) : lines ? (
        <div className="space-y-4 text-sm">
          {lines.erased.length > 0 ? (
            <Section title="This will be erased">
              {lines.erased.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </Section>
          ) : null}
          {lines.open.length > 0 ? (
            <Section title="Still open">
              {lines.open.map((l) => (
                <li key={l} className="text-danger-fg">
                  {l}
                </li>
              ))}
            </Section>
          ) : null}
          <p className="text-[13px] font-medium text-danger-fg">{lines.note}</p>
          <div>
            <label htmlFor="distributor-delete-confirm" className="mb-1.5 block text-sm font-medium text-text">
              Type “{distributor?.name}” to confirm
            </label>
            <Input id="distributor-delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-text">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-text-muted">{children}</ul>
    </div>
  );
}
