'use client';

import type { UserDeviceDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { toErrorState } from '@/lib/api/toErrorState';
import { ageLabel } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useUserDevices } from '../hooks/useDevices';
import { PLATFORM_LABEL, STATUS_LABEL, STATUS_TONE, orderDevices, slotsInUse, type DeviceAction } from '../lib/devices';
import { DeviceActionButtons } from './DeviceActionButtons';
import { DeviceActionDialog } from './DeviceActionDialog';

/** One employee's phones, every status. HR may look; approving, rejecting and removing is Admin's (`locked`). */
export function UserDevicesSection({ userId, locked = false }: { userId: string; locked?: boolean }) {
  const readOnly = useIsReadOnly() || locked;
  const query = useUserDevices(userId);
  const [chosen, setChosen] = useState<{ action: DeviceAction; device: UserDeviceDto } | null>(null);
  const devices = query.data ? orderDevices(query.data) : [];

  return (
    <Card
      title="Devices"
      description={
        query.data
          ? `${slotsInUse(query.data)} in use (registered or awaiting approval). Logging out never frees a slot; removing a device does.`
          : 'Every phone this employee has used.'
      }
    >
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={devices.length === 0}
        empty={{ title: 'No devices yet', description: 'A phone appears here when the employee first tries to sign in on it.' }}
      >
        <ul className="divide-y divide-border">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{d.deviceName}</span>
                  <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  {d.status === 'REGISTERED' ? (
                    <Badge tone={d.loggedIn ? 'accent' : 'neutral'}>{d.loggedIn ? 'Signed in' : 'Signed out'}</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-text-subtle">
                  {d.deviceModel} · {PLATFORM_LABEL[d.platform]} · requested {formatDate(d.requestedAt)}
                  {d.lastActiveAt ? ` · active ${ageLabel(d.lastActiveAt)} ago` : ''}
                  {d.status === 'REJECTED' && d.expiresAt ? ` · can ask again after ${formatDate(d.expiresAt)}` : ''}
                </p>
              </div>
              <DeviceActionButtons device={d} disabled={readOnly} onAction={(action) => setChosen({ action, device: d })} />
            </li>
          ))}
        </ul>
      </DataState>
      {chosen ? (
        <DeviceActionDialog
          action={chosen.action}
          target={{ userId, deviceRowId: chosen.device.id }}
          deviceName={chosen.device.deviceName}
          onClose={() => setChosen(null)}
        />
      ) : null}
    </Card>
  );
}
