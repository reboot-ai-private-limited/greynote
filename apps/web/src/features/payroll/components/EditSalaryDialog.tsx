'use client';

import { DAY_OUTCOMES, type DayOutcomeDto, type PayrollRunDto } from '@greynote/contracts';
import { useMemo, useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatDate, formatMoney } from '@/lib/format';
import { rupeesToPaise } from '@/lib/money';
import { useAdjustAmount, useOverrideDay } from '../hooks/usePayroll';
import { CHARGEABLE_DAY_STATUSES, DAY_OUTCOME_LABEL, PAYROLL_DAY_LABEL } from '../lib/payroll';

type Kind = 'day' | 'add' | 'cut';
const ADD_LABELS = ['Bonus', 'Incentive', 'Arrears', 'Allowance', 'Other'] as const;
const CUT_LABELS = ['Penalty', 'Advance recovery', 'Other'] as const;

/**
 * One place for HR to change a draft's pay: make a day something else (a leave nobody entered becomes Paid leave; a worked day becomes
 * Absent), add money under a name (Bonus…), or cut money (by days or in rupees). Each change needs a reason and is kept with who and when.
 */
export function EditSalaryDialog({ run, initialDate, onClose }: { run: PayrollRunDto; initialDate?: string | undefined; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('day');
  const [date, setDate] = useState(initialDate ?? '');
  const [outcome, setOutcome] = useState<DayOutcomeDto>('PAID_LEAVE');
  const [labelChoice, setLabelChoice] = useState<string>('Bonus');
  const [custom, setCustom] = useState('');
  const [cutBy, setCutBy] = useState<'days' | 'rupees'>('days');
  const [days, setDays] = useState('1');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const done = () => onClose();
  const saveDay = useOverrideDay(run.id, done);
  const saveAmount = useAdjustAmount(run.id, done);

  const dayOptions = useMemo(() => run.days.filter((d) => CHARGEABLE_DAY_STATUSES.has(d.status)).map((d) => ({ value: d.date, label: `${formatDate(d.date)} · ${PAYROLL_DAY_LABEL[d.status] ?? d.status}` })), [run.days]);
  const labels = kind === 'add' ? ADD_LABELS : CUT_LABELS;
  const dayCost = Math.round(run.baseSalaryPaise / run.payDays);
  const cutDays = Number(days);
  const cutPreview = cutBy === 'days' && Number.isFinite(cutDays) && cutDays > 0 ? formatMoney(Math.round((run.baseSalaryPaise * cutDays) / run.payDays)) : null;

  function changeKind(next: Kind) {
    setKind(next);
    setLabelChoice(next === 'cut' ? 'Penalty' : 'Bonus');
    setErrors({});
  }

  function submit() {
    const next: Record<string, string> = {};
    if (reason.trim() === '') next['reason'] = 'A reason is required.';
    if (kind === 'day') {
      if (date === '') next['date'] = 'Pick the day.';
      setErrors(next);
      if (Object.keys(next).length > 0) return;
      return saveDay.mutate({ date, outcome, reason: reason.trim() });
    }
    const label = (labelChoice === 'Other' ? custom : labelChoice).trim();
    if (label === '') next['label'] = 'Give it a name.';
    let body: { amountPaise?: number; cutDays?: number } = {};
    if (kind === 'cut' && cutBy === 'days') {
      if (!Number.isFinite(cutDays) || cutDays < 0.5 || cutDays > run.payDays || !Number.isInteger(cutDays * 2)) next['days'] = 'Enter whole or half days, like 1 or 1.5.';
      else body = { cutDays };
    } else {
      const paise = rupeesToPaise(amount);
      if (paise === null || paise === 0) next['amount'] = 'Enter an amount in rupees, more than zero.';
      else body = { amountPaise: kind === 'cut' ? -paise : paise };
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveAmount.mutate({ ...body, label, reason: reason.trim() });
  }

  return (
    <FormDialog
      title="Edit salary"
      description={`${run.userName} · this draft only. A day is worth ${formatMoney(dayCost)} (base ÷ ${run.payDays}). Every change is kept with your name, the time and the reason.`}
      formId="edit-salary-form"
      pending={saveDay.isPending || saveAmount.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="What do you want to do?" htmlFor="edit-salary-kind">
        <Select id="edit-salary-kind" value={kind} onValueChange={(v) => changeKind(v as Kind)} options={[{ value: 'day', label: 'Change a day (leave not entered, absent, worked)' }, { value: 'add', label: 'Add money (bonus, incentive, arrears)' }, { value: 'cut', label: 'Cut money (penalty, recovery)' }]} />
      </FormField>

      {kind === 'day' ? (
        <>
          <FormField label="Which day" htmlFor="edit-salary-date" {...(errors['date'] ? { error: errors['date'] } : {})}>
            <Select id="edit-salary-date" value={date} onValueChange={setDate} placeholder="Pick a day" options={dayOptions} />
          </FormField>
          <FormField label="Make it" htmlFor="edit-salary-outcome">
            <Select id="edit-salary-outcome" value={outcome} onValueChange={(v) => setOutcome(v as DayOutcomeDto)} options={DAY_OUTCOMES.map((o) => ({ value: o, label: DAY_OUTCOME_LABEL[o] }))} />
          </FormField>
          <p className="text-sm text-text-muted">Only this salary slip changes. The leave balance and the attendance record are not touched.</p>
        </>
      ) : (
        <>
          <FormField label="Name on the slip" htmlFor="edit-salary-label" {...(errors['label'] ? { error: errors['label'] } : {})}>
            <Select id="edit-salary-label" value={labelChoice} onValueChange={setLabelChoice} options={labels.map((l) => ({ value: l, label: l }))} />
          </FormField>
          {labelChoice === 'Other' ? (
            <FormField label="Other name" htmlFor="edit-salary-custom">
              <Input id="edit-salary-custom" maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} />
            </FormField>
          ) : null}
          {kind === 'cut' ? (
            <FormField label="Cut by" htmlFor="edit-salary-cutby">
              <Select id="edit-salary-cutby" value={cutBy} onValueChange={(v) => setCutBy(v as 'days' | 'rupees')} options={[{ value: 'days', label: 'Days of pay' }, { value: 'rupees', label: 'An amount in rupees' }]} />
            </FormField>
          ) : null}
          {kind === 'cut' && cutBy === 'days' ? (
            <FormField label="Days" htmlFor="edit-salary-days" {...(errors['days'] ? { error: errors['days'] } : {})}>
              <Input id="edit-salary-days" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={errors['days'] ? true : undefined} />
              {cutPreview ? <p className="mt-1 text-sm text-text-muted">Takes off {cutPreview}.</p> : null}
            </FormField>
          ) : (
            <FormField label="Amount (₹)" htmlFor="edit-salary-amount" {...(errors['amount'] ? { error: errors['amount'] } : {})}>
              <Input id="edit-salary-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={errors['amount'] ? true : undefined} />
            </FormField>
          )}
        </>
      )}

      <FormField label="Reason" htmlFor="edit-salary-reason" {...(errors['reason'] ? { error: errors['reason'] } : {})}>
        <Textarea id="edit-salary-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={errors['reason'] ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
