'use client';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDeviceAction, type DeviceTarget } from '../hooks/useDevices';
import { ACTION_LABEL, confirmCopy, type DeviceAction } from '../lib/devices';

/** Confirms one device action. Mounted only while an action is chosen, so the mutation is bound to it. */
export function DeviceActionDialog({
  action,
  target,
  deviceName,
  onClose,
}: {
  action: DeviceAction;
  target: DeviceTarget;
  deviceName: string;
  onClose: () => void;
}) {
  const mutation = useDeviceAction(action, onClose);
  const copy = confirmCopy(action, deviceName);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy.title}
      description={copy.description}
      confirmLabel={ACTION_LABEL[action]}
      tone={copy.tone}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate(target)}
    />
  );
}
