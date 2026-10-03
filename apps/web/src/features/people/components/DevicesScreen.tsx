'use client';

import type { PendingDeviceDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { ageLabel } from '@/lib/dates';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { usePendingDevices } from '../hooks/useDevices';
import { PLATFORM_LABEL, type DeviceAction } from '../lib/devices';
import { DeviceActionButtons } from './DeviceActionButtons';
import { DeviceActionDialog } from './DeviceActionDialog';

/** Every phone awaiting approval, oldest first. A field employee cannot sign in on a new phone until it is approved here. */
export function DevicesScreen() {
  const readOnly = useIsReadOnly();
  const query = usePendingDevices();
  const [chosen, setChosen] = useState<{ action: DeviceAction; device: PendingDeviceDto } | null>(null);

  const columns: readonly Column<PendingDeviceDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (d) => (
        <div>
          <Link href={`/employees/${d.userId}`} className="font-medium text-text hover:text-accent hover:underline">
            {d.employeeName ?? 'Unknown employee'}
          </Link>
          <div className="text-xs text-text-subtle">{d.employeeCode ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'device',
      header: 'Phone',
      render: (d) => (
        <div>
          <div>{d.deviceName}</div>
          <div className="text-xs text-text-subtle">
            {d.deviceModel} · {PLATFORM_LABEL[d.platform]}
          </div>
        </div>
      ),
    },
    { key: 'requested', header: 'Waiting', render: (d) => (ageLabel(d.requestedAt) === 'just now' ? 'Just now' : ageLabel(d.requestedAt)) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (d) => (
        <div className="flex justify-end">
          <DeviceActionButtons
            device={{ status: 'PENDING', loggedIn: false, deviceName: d.deviceName }}
            disabled={readOnly}
            onAction={(action) => setChosen({ action, device: d })}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Devices"
        description="New phones waiting for approval. A field employee can't sign in on one until you approve it, and each employee has a limited number of slots."
      />
      <Card>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={query.data?.length === 0}
          empty={{ title: 'Nothing waiting', description: 'Every phone request has been decided.' }}
        >
          <DataTable columns={columns} rows={query.data ?? []} rowKey={(d) => d.id} />
        </DataState>
      </Card>
      {chosen ? (
        <DeviceActionDialog
          action={chosen.action}
          target={{ userId: chosen.device.userId, deviceRowId: chosen.device.id }}
          deviceName={chosen.device.deviceName}
          onClose={() => setChosen(null)}
        />
      ) : null}
    </>
  );
}
