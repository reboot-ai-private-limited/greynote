'use client';

import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useMissedDoctors } from '../hooks/useCallPerformance';
import { MISSED_HEADER, missedRows } from '../lib/callPerformance';

/** The doctors an employee (a manager: their team) holds that got no call in the period, with a CSV of the same list. */
export function MissedDoctorsDialog({ employee, team, fromMonth, toMonth, onClose }: { employee: { id: string; name: string }; team: boolean; fromMonth: string; toMonth: string; onClose: () => void }) {
  const missed = useMissedDoctors(employee.id, fromMonth, toMonth);
  const list = missed.data ?? [];
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Never met: ${employee.name}${team ? '’s team' : ''}`}
      footer={
        <>
          <Button variant="secondary" disabled={list.length === 0} onClick={() => downloadCsv(`GREYNOTE NEVER MET ${employee.name} ${fromMonth}.csv`, toCsv(MISSED_HEADER, missedRows(list)))}>
            Download CSV
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <DataState
        isLoading={missed.isLoading}
        error={missed.error ? toErrorState(missed.error, () => void missed.refetch()) : null}
        isEmpty={list.length === 0}
        empty={{ title: 'Every doctor was met', description: 'No doctor held went without a call in this period.' }}
        skeleton={<Skeleton className="h-40 w-full" />}
      >
        <ul className="divide-y divide-border text-sm">
          {list.map((d) => (
            <li key={`${d.heldBy?.id ?? ''}-${d.id}`} className="py-2">
              <p className="font-medium text-text">{d.name}</p>
              <p className="text-text-muted">
                {[d.specialty, d.placeName, d.address, d.visitFrequency ? `${d.visitFrequency} a month` : null, team && d.heldBy ? `held by ${d.heldBy.name}` : null].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </DataState>
    </Dialog>
  );
}
