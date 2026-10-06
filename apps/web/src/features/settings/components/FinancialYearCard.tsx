'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { toErrorState } from '@/lib/api/toErrorState';
import { financialYearLabel } from '@/lib/financial-year';
import { useCloseYear, useFinancialYearClose } from '../hooks/useSettings';

/**
 * Closing a financial year: after it, payroll and expense payments for that year's months are refused, so a finished year's money no
 * longer changes. It is a deliberate Admin action and can be undone by reopening. Viewing is never affected.
 */
export function FinancialYearCard({ readOnly }: { readOnly: boolean }) {
  const query = useFinancialYearClose();
  const [pick, setPick] = useState('');
  const [confirm, setConfirm] = useState<{ action: 'close' | 'reopen'; year: number } | null>(null);
  const mutation = useCloseYear(confirm?.action ?? 'close', () => {
    setConfirm(null);
    setPick('');
  });
  const state = query.data;
  const year = pick || String(state?.closableYears[0] ?? '');

  return (
    <Card title="Financial year">
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!state}
        empty={{ title: 'Not available' }}
      >
        {state ? (
          <div className="space-y-5 p-5 text-sm">
            <p className="text-text-muted">
              Closing a year refuses payroll and expense payments for its months, so a finished year&apos;s money stops changing. Reports and lists can still be viewed. You can reopen a year if something must be corrected.
            </p>
            <div>
              <p className="mb-2 font-medium text-text">Closed years</p>
              {state.closedYears.length === 0 ? (
                <p className="text-text-muted">None closed.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {state.closedYears.map((y) => (
                    <li key={y} className="flex items-center justify-between px-3 py-2">
                      <span className="text-text">{financialYearLabel(y)}</span>
                      <Button size="sm" variant="secondary" disabled={readOnly} onClick={() => setConfirm({ action: 'reopen', year: y })}>
                        Reopen
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <p className="mb-1.5 font-medium text-text">Close a year</p>
                <Select
                  aria-label="Financial year to close"
                  value={year}
                  onValueChange={setPick}
                  options={state.closableYears.map((y) => ({ value: String(y), label: financialYearLabel(y) }))}
                  disabled={state.closableYears.length === 0}
                />
              </div>
              <Button disabled={readOnly || !year} onClick={() => setConfirm({ action: 'close', year: Number(year) })}>
                Close year
              </Button>
            </div>
          </div>
        ) : null}
      </DataState>

      {confirm ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirm.action === 'close' ? `Close ${financialYearLabel(confirm.year)}?` : `Reopen ${financialYearLabel(confirm.year)}?`}
          description={
            confirm.action === 'close'
              ? 'Payroll can no longer be generated or finalized, and expenses can no longer be paid, for any month of this year. You can reopen it later.'
              : 'Payroll and expense payments for this year\'s months will be allowed again.'
          }
          footer={
            <>
              <Button variant="secondary" disabled={mutation.isPending} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate(confirm.year)}>
                {mutation.isPending ? 'Working…' : confirm.action === 'close' ? 'Close year' : 'Reopen year'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">Viewing reports and lists for this year is not affected either way.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
