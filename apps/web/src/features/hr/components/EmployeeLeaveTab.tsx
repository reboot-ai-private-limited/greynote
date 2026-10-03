'use client';

import type { LeaveBalanceDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/Select';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useSetUserHq, useUserHq } from '@/features/territory/hooks/useUserHq';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { formatDate } from '@/lib/format';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useEmployeeBalances } from '../hooks/useBalances';
import { formatDays } from '../lib/days';
import { AdjustBalanceDialog } from './AdjustBalanceDialog';

/** An employee's leave balances for the year in view, and the HQ that decides which holidays apply to them. */
export function EmployeeLeaveTab({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <BalancesCard userId={userId} />
      <HqCard userId={userId} />
    </div>
  );
}

function BalancesCard({ userId }: { userId: string }) {
  const readOnly = useIsReadOnly();
  const { year } = useFinancialYear();
  const query = useEmployeeBalances(userId, year);
  const [adjusting, setAdjusting] = useState<LeaveBalanceDto | null>(null);
  const shown = query.data?.year ?? year ?? financialYearOf(istDate());

  const columns: readonly Column<LeaveBalanceDto>[] = [
    { key: 'type', header: 'Leave type', render: (b) => <span className="font-medium">{b.leaveTypeName}</span> },
    { key: 'allocated', header: 'Allocated', numeric: true, render: (b) => formatDays(b.allocatedDays) },
    { key: 'used', header: 'Used', numeric: true, render: (b) => formatDays(b.usedDays) },
    { key: 'pending', header: 'Pending', numeric: true, render: (b) => formatDays(b.pendingDays) },
    {
      key: 'available',
      header: 'Available',
      numeric: true,
      render: (b) => <span className={b.availableDays < 0 ? 'font-medium text-danger-fg' : 'font-medium'}>{formatDays(b.availableDays)}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      render: (b) => (
        <Button variant="ghost" size="sm" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setAdjusting(b)} aria-label={`Adjust ${b.leaveTypeName}`}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={`Leave balances · ${financialYearLabel(shown)}`}
      description="Pending days are held for open requests, so Available already excludes them. The year follows the financial-year selector."
    >
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={query.data?.balances.length === 0}
        empty={{ title: 'No leave balances', description: "An employee needs a Pay Band to have balances. Set it on the Profile tab, and add the grade's days on the Leave master." }}
      >
        <DataTable columns={columns} rows={query.data?.balances ?? []} rowKey={(b) => b.id} />
      </DataState>
      {adjusting ? <AdjustBalanceDialog balance={adjusting} onClose={() => setAdjusting(null)} /> : null}
    </Card>
  );
}

function HqCard({ userId }: { userId: string }) {
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const history = useUserHq(userId);
  const current = history.data?.find((h) => h.status === 'active');
  const [chosen, setChosen] = useState('');
  const set = useSetUserHq(userId, () => setChosen(''));

  return (
    <Card
      title="HQ"
      description="Decides which Zone and HQ holidays apply to this employee. With none set, only National holidays do."
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <p className="mb-1.5 text-sm font-medium text-text">Current HQ</p>
            <p className="text-sm text-text">{current ? directory.hqName(current.hqId) : <span className="text-text-subtle">None set</span>}</p>
          </div>
          <div className="w-64">
            <Select
              aria-label="Change HQ to"
              value={chosen}
              onValueChange={setChosen}
              options={directory.hqOptions.filter((o) => o.value !== current?.hqId)}
              placeholder="Choose an HQ"
            />
          </div>
          <Button disabled={readOnly || !chosen || set.isPending} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => set.mutate(chosen)}>
            {set.isPending ? 'Saving…' : current ? 'Change HQ' : 'Set HQ'}
          </Button>
        </div>

        {history.data && history.data.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">History</p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {history.data.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>{directory.hqName(h.hqId)}</span>
                  <span className="flex items-center gap-2 text-text-subtle">
                    {formatDate(h.assignedAt)}
                    {h.unassignedAt ? ` – ${formatDate(h.unassignedAt)}` : ''}
                    <Badge tone={h.status === 'active' ? 'success' : 'neutral'}>{h.status === 'active' ? 'Current' : 'Ended'}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
