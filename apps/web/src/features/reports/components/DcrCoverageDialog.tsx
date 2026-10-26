'use client';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { exportFilename, resolveExportOwner } from '@/lib/exportFilename';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { useDcrCoverage } from '../hooks/useDcrReport';
import { dcrCoverageCsv } from '../lib/dcr';

/** The doctors assigned to an employee now that they did not call on in the month, by speciality. */
export function DcrCoverageDialog({ userId, month, onClose }: { userId: string; month: string; onClose: () => void }) {
  const query = useDcrCoverage(userId, month, true);
  const c = query.data;
  const download = useCsvExport(async (token) => ({ filename: exportFilename(await resolveExportOwner(token, userId), 'doctors-not-visited', month), csv: dcrCoverageCsv(c!) }));
  const bySpeciality = new Map<string, string[]>();
  for (const d of c?.notVisited ?? []) bySpeciality.set(d.specialty, [...(bySpeciality.get(d.specialty) ?? []), d.name]);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={c ? `${c.mr.name} · doctors not visited` : 'Doctors not visited'}
      {...(c ? { description: `${c.mr.employeeCode} · ${monthLabel(month)} · ${c.visited} of ${c.assigned} assigned doctors called on` } : {})}
      footer={
        <>
          <Button variant="secondary" disabled={!c || c.notVisited.length === 0 || download.isPending} onClick={() => download.mutate()}>
            Download CSV
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : query.error || !c ? (
        <p role="alert" className="text-sm text-danger-fg">{query.error ? toErrorState(query.error).message : 'Not found.'}</p>
      ) : c.assigned === 0 ? (
        <p className="text-sm text-text-muted">No doctors are assigned to this employee.</p>
      ) : c.notVisited.length === 0 ? (
        <p role="status" className="rounded-md bg-success-bg px-3 py-2 text-sm text-success-fg">Every assigned doctor was called on this month.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-text-subtle">The doctors assigned now, checked against the reported days of {monthLabel(month)}.</p>
          {[...bySpeciality].map(([speciality, names]) => (
            <section key={speciality}>
              <h3 className="mb-1 text-sm font-semibold text-text">
                {speciality} <span className="font-normal text-text-subtle">· {names.length}</span>
              </h3>
              <ul className="list-inside list-disc text-sm text-text-muted">
                {names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
