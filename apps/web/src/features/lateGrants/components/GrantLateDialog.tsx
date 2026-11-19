'use client';

import type { BulkGrantLateResultDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { Select } from '@/components/ui/Select';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useBulkGrantLate, useGrantLate, useLateGrantPreview } from '../hooks/useLateGrants';
import { buildBulkGrant, buildGrant, DURATION_OPTIONS, isDayKind, kindOptions, SKIP_LABEL, type GrantForm } from '../lib/lateGrants';
import { EmployeeListField } from './EmployeeListField';

/**
 * Lets one employee do one late thing — send a plan, send or approve a month of expenses, enter a closed month's stock — until a date and
 * time Admin picks (business timezone). Once employee, kind and period are chosen, the server says whether that period is still open to
 * a late entry (payroll finalized, expenses paid…); if not, the reason shows and the button stays off.
 */
export function GrantLateDialog({
  onClose,
  initial,
  groups,
}: {
  onClose: () => void;
  /** Pre-fills the form, e.g. from an expense month that is past its deadline. */
  initial?: Partial<Pick<GrantForm, 'userId' | 'kind' | 'periodKey'>>;
  /** Offer only these groups of kinds (`Plans`, `Expenses`, `Sales`); all when absent. */
  groups?: readonly string[];
}) {
  const options = kindOptions(groups);
  const [form, setForm] = useState<GrantForm>({
    userId: '',
    kind: (options[0]?.value ?? 'MONTHLY_PLAN') as GrantForm['kind'],
    periodKey: '',
    reason: '',
    duration: '1h',
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // "Several employees": the same exception for a list. The server answers who was allowed and who was left out, and why.
  const [several, setSeveral] = useState(false);
  const [userIds, setUserIds] = useState<string[]>(initial?.userId ? [initial.userId] : []);
  const [result, setResult] = useState<BulkGrantLateResultDto | null>(null);
  const grant = useGrantLate(onClose);
  const bulk = useBulkGrantLate((r) => setResult(r));
  const set = <K extends keyof GrantForm>(key: K, value: GrantForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const day = isDayKind(form.kind);
  const periodValid = day ? /^\d{4}-\d{2}-\d{2}$/.test(form.periodKey) : /^\d{4}-(0[1-9]|1[0-2])$/.test(form.periodKey);
  const previewUser = several ? (userIds[0] ?? '') : form.userId;
  const preview = useLateGrantPreview({ userId: previewUser, kind: form.kind, periodKey: form.periodKey }, Boolean(previewUser) && periodValid);
  const locked = preview.data?.lockedReason ?? null;

  function submit() {
    if (several) {
      const { userId: _one, ...shared } = form;
      void _one;
      const b = buildBulkGrant({ ...shared, userIds });
      if (!b.ok) return setErrors(b.errors);
      setErrors({});
      return bulk.mutate(b.body);
    }
    const built = buildGrant(form);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    grant.mutate(built.body);
  }

  if (result) {
    return (
      <FormDialog title="Done" formId="grant-late-form" pending={false} onClose={onClose} onSubmit={onClose}>
        <p className="text-sm">
          Allowed for <strong>{result.granted.length}</strong>
          {result.skipped.length > 0 ? <>, left out <strong>{result.skipped.length}</strong>:</> : '.'}
        </p>
        {result.skipped.length > 0 ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {result.skipped.map((s) => (
              <li key={s.userId} className="rounded-md bg-surface-subtle px-3 py-2">
                <span className="font-medium"><EmployeeName userId={s.userId} /></span> — {SKIP_LABEL[s.code]}
                <div className="text-xs text-text-subtle">{s.reason}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </FormDialog>
    );
  }

  return (
    <FormDialog
      title="Allow a late submission"
      description="One employee can do one late thing, once for the period you pick, until the time you set. Not possible once the money for that period is settled."
      formId="grant-late-form"
      pending={grant.isPending || bulk.isPending}
      disabled={!several && locked !== null}
      onClose={onClose}
      onSubmit={submit}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={several} onChange={(e) => { setSeveral(e.target.checked); setErrors({}); }} />
        Several employees at once
      </label>
      {several ? (
        <EmployeeListField value={userIds} onChange={setUserIds} error={errors['userIds']} />
      ) : (
        <EmployeePickerField id="grant-user" label="Employee" title="Choose an employee" value={form.userId} onChange={(v) => set('userId', v)} error={errors['userId']} />
      )}
      <FormField label="What" htmlFor="grant-kind">
        <Select id="grant-kind" value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as GrantForm['kind'], periodKey: '' }))} options={options} />
      </FormField>
      <FormField label={day ? 'Date' : 'Month'} htmlFor="grant-key" error={errors['periodKey']}>
        {day ? (
          <Input id="grant-key" type="date" value={form.periodKey} onChange={(e) => set('periodKey', e.target.value)} aria-invalid={errors['periodKey'] ? true : undefined} />
        ) : (
          <MonthPicker id="grant-key" value={form.periodKey} onChange={(v) => set('periodKey', v)} aria-invalid={errors['periodKey'] ? true : undefined} />
        )}
      </FormField>
      {locked ? (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {several ? `For ${userIds.length > 0 ? 'the first employee' : 'this period'}: ${locked}. Others in the list are checked one by one when you save.` : locked}
        </p>
      ) : null}
      <FormField
        label="Length"
        htmlFor="grant-length"
        hint={`How long the employee has from now.${form.kind === 'DAILY_PLAN' ? ' A daily plan’s exception ends at the latest at the end of its day.' : ''}`}
      >
        <Select id="grant-length" value={form.duration} onValueChange={(v) => set('duration', v as GrantForm['duration'])} options={DURATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
      </FormField>
      <FormField label="Reason" htmlFor="grant-reason" error={errors['reason']}>
        <Textarea id="grant-reason" maxLength={1000} value={form.reason} onChange={(e) => set('reason', e.target.value)} aria-invalid={errors['reason'] ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
