'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { exportFilename, resolveExportOwner } from '@/lib/exportFilename';
import { formatDate, formatMoney } from '@/lib/format';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { useTaDaDays } from '../hooks/useTaDaReport';
import { EXPENSE_TYPE_LABEL, taDaDaysCsv } from '../lib/taDa';

/** One employee's accepted expenses for a month, day by day: what each row is, the route, the amount, and whether it has been paid. */
export function TaDaDaysDialog({ userId, month, onClose }: { userId: string; month: string; onClose: () => void }) {
  const query = useTaDaDays(userId, month, true);
  const d = query.data;
  const download = useCsvExport(async (token) => ({ filename: exportFilename(await resolveExportOwner(token, userId), 'ta-da', month), csv: taDaDaysCsv(d!) }));
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={d ? `${d.mr.name} · ${monthLabel(month)}` : 'TA and DA'}
      {...(d ? { description: `${d.mr.employeeCode} · accepted expenses, day by day` } : {})}
      footer={
        <>
          <Button variant="secondary" disabled={!d || d.rows.length === 0 || download.isPending} onClick={() => download.mutate()}>
            Download CSV
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : query.error || !d ? (
        <p role="alert" className="text-sm text-danger-fg">{query.error ? toErrorState(query.error).message : 'Not found.'}</p>
      ) : d.rows.length === 0 ? (
        <p className="text-sm text-text-muted">No accepted expenses this month.</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Type</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Route</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={`${r.date}|${r.type}|${r.amountPaise}|${r.route?.id ?? ''}|${r.remarks ?? ''}`} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                    <td className="px-3 py-2">{EXPENSE_TYPE_LABEL[r.type]}</td>
                    <td className="px-3 py-2">
                      {r.route?.name ?? <span className="text-text-subtle">{r.remarks ?? '—'}</span>}
                      {r.distanceFlag ? (
                        <span className="ml-2">
                          <Badge tone="warning">Distance not calculated</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatMoney(r.amountPaise)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === 'PAID' ? 'success' : 'warning'}>{r.status === 'PAID' ? `Paid${r.paidAt ? ` ${formatDate(r.paidAt)}` : ''}` : 'Unpaid'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.truncated ? <p role="status" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">This month has more rows than the list holds, so some are missing.</p> : null}
        </div>
      )}
    </Dialog>
  );
}
