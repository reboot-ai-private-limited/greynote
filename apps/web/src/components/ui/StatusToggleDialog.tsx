'use client';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** Confirms a status change. Deactivation is refused server-side while active children exist; its message is toasted. */
type ActiveStatus = 'active' | 'inactive';

export function StatusToggleDialog({
  item,
  noun,
  pending,
  onClose,
  onConfirm,
}: {
  item: { id: string; name: string; status: ActiveStatus } | null;
  noun: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (next: ActiveStatus) => void;
}) {
  const deactivating = item?.status === 'active';
  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={deactivating ? `Deactivate ${noun}` : `Reactivate ${noun}`}
      description={
        deactivating
          ? `“${item?.name}” stays in history but is hidden from new use.`
          : `“${item?.name}” becomes available for new use again.`
      }
      confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
      tone={deactivating ? 'danger' : 'primary'}
      pending={pending}
      onConfirm={() => item && onConfirm(deactivating ? 'inactive' : 'active')}
    />
  );
}
