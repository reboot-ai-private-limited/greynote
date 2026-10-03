'use client';

import type { UserDeviceDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { ACTION_LABEL, actionsFor, type DeviceAction } from '../lib/devices';

/** The buttons a phone's state allows. Approve is the one primary action; the others are quiet. */
export function DeviceActionButtons({
  device,
  disabled,
  onAction,
}: {
  device: Pick<UserDeviceDto, 'status' | 'loggedIn' | 'deviceName'>;
  disabled: boolean;
  onAction: (action: DeviceAction) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {actionsFor(device).map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'approve' ? 'primary' : 'secondary'}
          disabled={disabled}
          title={disabled ? 'A past financial year is read-only' : undefined}
          aria-label={`${ACTION_LABEL[action]} ${device.deviceName}`}
          onClick={() => onAction(action)}
        >
          {ACTION_LABEL[action]}
        </Button>
      ))}
    </div>
  );
}
