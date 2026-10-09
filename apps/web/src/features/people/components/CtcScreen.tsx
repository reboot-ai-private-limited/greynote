'use client';

import type { CtcAssignmentDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { istMonth } from '@/lib/dates';
import { paiseToRupees } from '@/lib/money';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAssignCtc, useCtcHistory } from '../hooks/useCtc';
import { useCtcEditor } from '../hooks/useCtcEditor';
import { useUser } from '../hooks/useUsers';
import { inForce } from '../lib/ctc';
import { buildAssignCtc, structureToDraft, type CtcDraft } from '../lib/ctcStructure';
import { CtcBreakdown } from './ctc/CtcBreakdown';
import { CtcSummaryCard } from './ctc/CtcSummaryCard';

/**
 * Set or revise an employee's CTC. Enter the CTC and the Basic %, and the breakdown follows the org's pay components; open any line
 * to change it for this employee, remove it, or add one — "Other allowance" takes the rest, so the lines always add up. Saving adds
 * a new revision from the chosen month; earlier ones are kept.
 */
export function CtcScreen({ id }: { id: string }) {
  const query = useUser(id);
  const history = useCtcHistory(id);
  const user = query.data;
  const error = query.error ?? history.error;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link
          href={`/employees/${id}?tab=compensation`}
          className="text-text-muted hover:text-accent hover:underline"
        >
          ← {user?.name ?? 'Employee'}
        </Link>
      </p>
      <DataState
        isLoading={query.isLoading || history.isLoading}
        error={
          error
            ? toErrorState(error, () => void (query.error ? query.refetch() : history.refetch()))
            : null
        }
        isEmpty={!user}
        empty={{ title: 'Employee not found' }}
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {user && user.role !== 'FIELD' ? (
          <p className="rounded-lg border border-border bg-surface-subtle p-6 text-sm text-text-muted">
            Only field employees have a CTC.
          </p>
        ) : user ? (
          <CtcForm userId={id} current={inForce(history.data ?? [], istMonth())} />
        ) : null}
      </DataState>
    </>
  );
}

function CtcForm({ userId, current }: { userId: string; current: CtcAssignmentDto | undefined }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const back = () => router.push(`/employees/${userId}?tab=compensation`);
  const [draft, setDraft] = useState<CtcDraft>(() => ({
    ctc: current ? paiseToRupees(current.ctcAnnualPaise).replace(/\.00$/, '') : '',
    effectiveFrom: istMonth(),
    reason: '',
    structure: structureToDraft(current?.structure, current?.overrides),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editor = useCtcEditor(draft.ctc, draft.structure);
  const save = useAssignCtc(userId, back);
  const set = (patch: Partial<CtcDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function submit() {
    const built = buildAssignCtc(draft, editor.orgCodes);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    save.mutate(built.body);
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        {current ? 'Revise CTC' : 'Set CTC'}
      </h1>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid items-start gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]"
      >
        <div className="lg:sticky lg:top-6">
          <CtcSummaryCard
            ctc={draft.ctc}
            onCtcChange={(ctc) => set({ ctc })}
            structure={draft.structure}
            onStructureChange={(structure) => set({ structure })}
            editor={editor}
            errors={errors}
            footer={
              <>
                <Button
                  type="submit"
                  disabled={readOnly || save.isPending || !editor.canSave}
                  title={readOnly ? 'A past financial year is read-only' : undefined}
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="secondary" onClick={back}>
                  Cancel
                </Button>
              </>
            }
          >
            <FormField label="Starts from" htmlFor="ctc-from" error={errors['effectiveFrom']}>
              <Input
                id="ctc-from"
                type="month"
                value={draft.effectiveFrom}
                onChange={(e) => set({ effectiveFrom: e.target.value })}
                aria-invalid={errors['effectiveFrom'] ? true : undefined}
              />
            </FormField>
            <FormField label="Reason (optional)" htmlFor="ctc-reason" error={errors['reason']}>
              <Input
                id="ctc-reason"
                value={draft.reason}
                placeholder="Annual review"
                onChange={(e) => set({ reason: e.target.value })}
              />
            </FormField>
          </CtcSummaryCard>
        </div>
        <div>
          {editor.rows.length > 0 && draft.ctc.trim() !== '' ? (
            <CtcBreakdown
              editor={editor}
              structure={draft.structure}
              onStructureChange={(structure) => set({ structure })}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong px-5 py-10 text-center text-sm text-text-muted">
              Enter the CTC and the breakdown appears here, worked out from the pay components.
            </p>
          )}
        </div>
      </form>
    </>
  );
}
