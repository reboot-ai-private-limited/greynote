'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDeleteDoctor, useDoctorImpact, useUpdateDoctor } from '../hooks/useDoctors';
import { doctorImpactLines } from '../lib/doctors';

/**
 * Deactivating or permanently deleting a doctor (decision-log 2026-10-22). Both first show what the step touches: the MR who loses
 * it, plans that lose it, and what stays open or as history. Deactivating then ends the assignment in the same step; deleting also
 * asks for the doctor's name, since it can't be undone. A warning, never a block.
 */
export function RetireDoctorDialog({
  action,
  doctor,
  onClose,
  onDeleted,
}: {
  action: 'deactivate' | 'delete';
  doctor: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [typed, setTyped] = useState('');
  const impact = useDoctorImpact(doctor?.id ?? null);
  const close = () => {
    setTyped('');
    onClose();
  };
  const deactivate = useUpdateDoctor(close);
  const remove = useDeleteDoctor(() => {
    close();
    onDeleted?.();
  });
  const pending = deactivate.isPending || remove.isPending;
  const confirmed = action === 'deactivate' || typed.trim().toLowerCase() === (doctor?.name ?? '').trim().toLowerCase();
  const lines = impact.data ? doctorImpactLines(impact.data, action) : null;

  return (
    <Dialog
      open={doctor !== null}
      onOpenChange={(open) => !open && close()}
      title={action === 'delete' ? 'Delete doctor permanently' : 'Deactivate doctor'}
      description={
        doctor
          ? action === 'delete'
            ? `“${doctor.name}” will be removed for good. This cannot be undone.`
            : `“${doctor.name}” stops being visited. You can reactivate it later and assign an MR again.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!impact.data || !confirmed || pending}
            onClick={() => {
              if (!doctor) return;
              if (action === 'delete') remove.mutate(doctor.id);
              else deactivate.mutate({ id: doctor.id, body: { status: 'inactive' } });
            }}
          >
            {pending ? (action === 'delete' ? 'Deleting…' : 'Deactivating…') : action === 'delete' ? 'Delete permanently' : 'Deactivate'}
          </Button>
        </>
      }
    >
      {impact.isLoading ? (
        <p className="text-[13px] text-text-subtle">Checking what this affects…</p>
      ) : impact.error ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {toErrorState(impact.error).message}
        </p>
      ) : lines ? (
        <div className="space-y-4 text-sm">
          {lines.changes.length > 0 ? (
            <Section title="What changes now">
              {lines.changes.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </Section>
          ) : null}
          {lines.open.length > 0 ? (
            <Section title="Stays, and may need attention">
              {lines.open.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </Section>
          ) : null}
          {lines.history.length > 0 ? (
            <Section title="History, kept">
              {lines.history.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </Section>
          ) : null}
          {lines.changes.length + lines.open.length + lines.history.length === 0 ? (
            <p className="text-text-muted">Nothing else uses this doctor.</p>
          ) : (
            <p className="text-[13px] text-text-subtle">Past calls, gifts, samples and reports keep showing the doctor’s name.</p>
          )}
          {action === 'delete' ? (
            <div>
              <label htmlFor="doctor-delete-confirm" className="mb-1.5 block text-sm font-medium text-text">
                Type “{doctor?.name}” to confirm
              </label>
              <Input id="doctor-delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          ) : null}
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
