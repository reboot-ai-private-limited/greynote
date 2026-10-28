'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { usePayBands } from '@/features/people/hooks/useMasterData';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useLeavePolicies, useSaveLeavePolicies } from '../hooks/useLeavePolicies';
import { useLeaveTypes } from '../hooks/useLeaveTypes';
import { formatDays } from '../lib/days';
import { POLICY_NOTE, buildPolicyGrid, cellKey, collectPolicyChanges } from '../lib/policy';

/** How many days each grade gets, per paid leave type and leave year: the defaults a new balance is created from. */
export function LeaveMasterTab() {
  // Leave setup is Admin's to change; HR can read it.
  const readOnly = useIsReadOnly() || useSession().user?.role !== 'ADMIN';
  const bands = usePayBands();
  const types = useLeaveTypes();
  const policies = useLeavePolicies();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveLeavePolicies((result) => {
    // A saved cell is no longer a draft; a refused one stays as typed, with the server's reason beside it.
    setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => result.failed.some((f) => cellKey(f.change.payBandId, f.change.leaveTypeId) === key))));
    setErrors(Object.fromEntries(result.failed.map((f) => [cellKey(f.change.payBandId, f.change.leaveTypeId), f.message])));
    if (result.failed.length === 0) toast.success(`${result.saved.length} ${result.saved.length === 1 ? 'default' : 'defaults'} saved.`);
    else toast.error(`${result.saved.length} saved, ${result.failed.length} refused. See the cells marked in red.`);
  });

  const loading = bands.isLoading || types.isLoading || policies.isLoading;
  const error = bands.error ?? types.error ?? policies.error;
  const grid = buildPolicyGrid(bands.data ?? [], types.data ?? [], policies.data ?? []);
  const dirty = Object.keys(drafts).length;

  function submit() {
    const { changes, errors: found } = collectPolicyChanges(grid, drafts);
    setErrors(found);
    if (Object.keys(found).length > 0 || changes.length === 0) {
      if (changes.length === 0 && Object.keys(found).length === 0) setDrafts({});
      return;
    }
    save.mutate(changes);
  }

  return (
    <Card title="Leave master" description="Default days per leave year for each grade. Only paid leave types are here: an unpaid one has no balance.">
      <DataState
        isLoading={loading}
        error={error ? toErrorState(error, () => { void bands.refetch(); void types.refetch(); void policies.refetch(); }) : null}
        isEmpty={grid.rows.length === 0 || grid.columns.length === 0}
        empty={{
          title: grid.rows.length === 0 ? 'No pay grades yet' : 'No paid leave types',
          description:
            grid.rows.length === 0
              ? 'Create the grades first, then set their leave days here.'
              : 'Add a paid leave type on the Leave types tab, then set its days here.',
        }}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-subtle text-xs font-medium uppercase tracking-wide text-text-subtle">
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-3 font-medium">Grade</th>
                  {grid.columns.map((c) => (
                    <th key={c.id} scope="col" className="px-5 py-3 font-medium">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.payBandId} className="border-b border-border last:border-0">
                    <th scope="row" className="px-5 py-3 font-medium">{row.name}</th>
                    {row.cells.map((cell) => {
                      const key = cellKey(cell.payBandId, cell.leaveTypeId);
                      const typed = drafts[key];
                      const value = typed ?? (cell.days === null ? '' : formatDays(cell.days));
                      const type = grid.columns.find((c) => c.id === cell.leaveTypeId)?.name ?? '';
                      return (
                        <td key={key} className="px-5 py-2 align-top">
                          <Input
                            inputMode="decimal"
                            aria-label={`${row.name} ${type} days`}
                            value={value}
                            placeholder={cell.days === null ? 'not set' : undefined}
                            disabled={readOnly}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            aria-invalid={errors[key] ? true : undefined}
                            className="w-24 tabular-nums"
                          />
                          {errors[key] ? (
                            <p role="alert" className="mt-1 max-w-48 text-[13px] text-danger-fg">{errors[key]}</p>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
            <p className="max-w-2xl text-[13px] text-text-subtle">{POLICY_NOTE}</p>
            <div className="flex items-center gap-3">
              {dirty > 0 ? (
                <Button variant="ghost" onClick={() => { setDrafts({}); setErrors({}); }} disabled={save.isPending}>
                  Discard
                </Button>
              ) : null}
              <Button type="submit" disabled={readOnly || dirty === 0 || save.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
                {save.isPending ? 'Saving…' : dirty > 0 ? `Save ${dirty} ${dirty === 1 ? 'change' : 'changes'}` : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </DataState>
      {grid.rows.length === 0 ? (
        <p className="border-t border-border px-5 py-3 text-sm">
          <Link href="/pay-grades" className="text-accent hover:underline">Go to Pay grades</Link>
        </p>
      ) : null}
    </Card>
  );
}
