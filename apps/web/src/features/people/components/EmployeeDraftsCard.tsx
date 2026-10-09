'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/format';
import { useDeleteEmployeeDraft, useEmployeeDrafts } from '../hooks/useEmployeeDrafts';
import { STEPS } from '../lib/onboarding';

/** New employees started but not created yet. Renders nothing when there are none. */
export function EmployeeDraftsCard() {
  const drafts = useEmployeeDrafts();
  const remove = useDeleteEmployeeDraft();
  const [deleting, setDeleting] = useState<string | null>(null);
  const items = drafts.data ?? [];
  if (items.length === 0) return null;

  return (
    <Card title={`Drafts (${items.length})`} className="mb-6">
      <ul className="divide-y divide-border">
        {items.map((d) => {
          const step = STEPS[Math.min(d.step, STEPS.length) - 1];
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{d.data.personal?.name ?? 'Unnamed'}</p>
                <p className="text-[13px] text-text-subtle">
                  Step {Math.min(d.step, STEPS.length)} of {STEPS.length} · {step?.label} · saved {formatDateTime(d.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDeleting(d.id)}>
                  Delete
                </Button>
                <Link
                  href={`/employees/new?draft=${d.id}`}
                  className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[13px] font-medium text-accent-text hover:bg-accent-hover"
                >
                  Continue
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Card>
  );
}
