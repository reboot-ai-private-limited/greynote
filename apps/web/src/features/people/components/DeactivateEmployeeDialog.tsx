'use client';

import type { DeactivationResultDto, UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDeactivateUser, useDeactivationImpact } from '../hooks/useUsers';
import { buildDeactivation, deactivationLines, DEACTIVATE_CONSEQUENCE, STEP_LABEL, type DeactivationDraft } from '../lib/security';
import { EmployeePickerField } from './EmployeePickerField';

/**
 * Deactivating an employee who has left (decision-log 2026-10-22), in one dialog: the last working day; a new manager for their team,
 * when they have one (their own manager is suggested); who takes over their doctors (optional); what will happen; and their employee
 * code typed to confirm. When it is done, each part of the hand-over says what it did, and one that failed can be run again from the
 * employee's page.
 */
export function DeactivateEmployeeDialog({ user, onClose }: { user: UserDetailDto; onClose: () => void }) {
  const [draft, setDraft] = useState<DeactivationDraft>({ lastWorkingDay: '', newManagerId: '', doctorHandoverTo: '', typedCode: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof DeactivationDraft, string>>>({});
  const [result, setResult] = useState<DeactivationResultDto | null>(null);
  const impact = useDeactivationImpact(user.id, draft.lastWorkingDay || undefined, result === null);
  const deactivate = useDeactivateUser(user.id, setResult);
  const data = impact.data;
  const set = (patch: Partial<DeactivationDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // The day defaults to today, and the team to their own manager, once the impact has loaded.
  const lastWorkingDay = draft.lastWorkingDay || data?.today || '';
  const newManagerId = draft.newManagerId || (data?.directReports.length ? (data.suggestedManager?.id ?? '') : '');

  function submit() {
    if (!data) return;
    const built = buildDeactivation({ ...draft, lastWorkingDay, newManagerId }, data);
    setErrors(built.ok ? {} : built.errors);
    if (built.ok) deactivate.mutate(built.body);
  }

  if (result) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()} title={`${user.name} is deactivated`} footer={<Button onClick={onClose}>Done</Button>}>
        <div className="space-y-3 text-sm">
          {result.teamMoved > 0 ? <p>{result.teamMoved === 1 ? '1 person moved' : `${result.teamMoved} people moved`} to the new manager.</p> : null}
          <ul className="divide-y divide-border rounded-md border border-border">
            {result.steps.map((s) => (
              <li key={s.step} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="font-medium">{STEP_LABEL[s.step]}</span>
                <span className={s.ok ? 'text-right text-text-muted' : 'text-right text-danger-fg'}>{s.detail}</span>
              </li>
            ))}
          </ul>
          {result.steps.some((s) => !s.ok) ? <p className="text-[13px] text-text-subtle">Use “Run the hand-over again” on the employee’s Security tab to retry the parts that failed.</p> : null}
        </div>
      </Dialog>
    );
  }

  const lines = data ? deactivationLines(data) : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Deactivate ${user.name}`}
      description={DEACTIVATE_CONSEQUENCE}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!data || deactivate.isPending} onClick={submit}>
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </>
      }
    >
      {impact.isLoading && !data ? (
        <p className="text-[13px] text-text-subtle">Checking what this affects…</p>
      ) : impact.error && !data ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {toErrorState(impact.error).message}
        </p>
      ) : data ? (
        <div className="space-y-4">
          <FormField label="Last working day" htmlFor="deactivate-day" error={errors.lastWorkingDay} hint="Today or earlier. Salary can still be run up to this month; the days after it count as not employed.">
            <Input id="deactivate-day" type="date" max={data.today} value={lastWorkingDay} onChange={(e) => set({ lastWorkingDay: e.target.value })} aria-invalid={errors.lastWorkingDay ? true : undefined} />
          </FormField>
          {data.directReports.length > 0 ? (
            <EmployeePickerField
              id="deactivate-manager"
              label={`New manager for ${data.directReports.length === 1 ? 'their 1 team member' : `their ${data.directReports.length} team members`}`}
              title="Who does the team report to now?"
              value={newManagerId}
              selfId={user.id}
              onChange={(id) => set({ newManagerId: id })}
              error={errors.newManagerId}
              hint={`${data.directReports.map((p) => p.name).slice(0, 5).join(', ')}${data.directReports.length > 5 ? ' …' : ''}. Requests waiting on ${user.name} go to the new manager.`}
            />
          ) : null}
          {data.work.doctors > 0 ? (
            <EmployeePickerField
              id="deactivate-handover"
              label={`Hand over their ${data.work.doctors === 1 ? 'doctor' : `${data.work.doctors} doctors`} to`}
              title="Who takes over the doctors?"
              value={draft.doctorHandoverTo}
              selfId={user.id}
              onChange={(id) => set({ doctorHandoverTo: id })}
              error={errors.doctorHandoverTo}
              hint="Optional. They get each doctor on a route they have; the rest are left unassigned for you to give to someone."
            />
          ) : null}
          {lines.length > 0 ? (
            <div>
              <p className="mb-1 text-[13px] font-medium text-text">What happens</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-text-muted">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-text-muted">They manage nobody and hold no routes, doctors or open requests.</p>
          )}
          <FormField label={`Type ${user.employeeCode} to confirm`} htmlFor="deactivate-code" error={errors.typedCode}>
            <Input id="deactivate-code" value={draft.typedCode} autoComplete="off" onChange={(e) => set({ typedCode: e.target.value })} aria-invalid={errors.typedCode ? true : undefined} />
          </FormField>
        </div>
      ) : null}
    </Dialog>
  );
}
