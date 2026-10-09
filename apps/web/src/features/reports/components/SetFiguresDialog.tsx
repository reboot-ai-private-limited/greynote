'use client';

import type { SalesDashboardRowDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';
import { useSaveMonthFigures } from '../hooks/useSalesDashboard';
import { financialYearMonths } from '../lib/salesDashboard';

/**
 * Set one employee's monthly target and what they sold, for a month of the current financial year. Either can be left empty to keep it
 * as it is. The month starts on the one the dashboard shows, with its saved figures; picking another month starts empty.
 */
export function SetFiguresDialog({
  row,
  month: shown,
  onClose,
}: {
  row: SalesDashboardRowDto;
  month: string;
  onClose: () => void;
}) {
  const months = financialYearMonths(financialYearOf(istDate()));
  const [month, setMonth] = useState(months.includes(shown) ? shown : (months[0] ?? shown));
  const saved = month === shown;
  const [target, setTarget] = useState(
    saved && row.targetPaise !== null ? paiseToRupees(row.targetPaise) : '',
  );
  const [achieved, setAchieved] = useState(
    saved && row.achievedPaise !== null ? paiseToRupees(row.achievedPaise) : '',
  );
  const [errors, setErrors] = useState<{ target?: string; achieved?: string; form?: string }>({});
  const save = useSaveMonthFigures(onClose);

  function pickMonth(next: string) {
    setMonth(next);
    const same = next === shown;
    setTarget(same && row.targetPaise !== null ? paiseToRupees(row.targetPaise) : '');
    setAchieved(same && row.achievedPaise !== null ? paiseToRupees(row.achievedPaise) : '');
    setErrors({});
  }

  function submit() {
    const t = target.trim() === '' ? undefined : rupeesToPaise(target);
    const a = achieved.trim() === '' ? undefined : rupeesToPaise(achieved);
    const found = {
      ...(t === null || t === 0 ? { target: 'Enter an amount in rupees, more than zero.' } : {}),
      ...(a === null ? { achieved: 'Enter an amount in rupees.' } : {}),
      ...(t === undefined && a === undefined
        ? { form: 'Enter a target, an achievement, or both.' }
        : {}),
    };
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate({
      ...(typeof t === 'number'
        ? { target: { userId: row.employee.id, month, targetAmountPaise: t } }
        : {}),
      ...(typeof a === 'number'
        ? { achievement: { userId: row.employee.id, month, achievedAmountPaise: a } }
        : {}),
    });
  }

  return (
    <FormDialog
      title={`Target and achievement: ${row.employee.name}`}
      description="Only a month of the current financial year can be set. Saving again replaces the figure."
      formId="month-figures-form"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Month" htmlFor="figures-month">
        <Select
          id="figures-month"
          value={month}
          onValueChange={pickMonth}
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
      </FormField>
      <FormField
        label="Target (₹)"
        htmlFor="figures-target"
        error={errors.target}
        hint="What they are meant to sell in the month."
      >
        <Input
          id="figures-target"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-invalid={errors.target ? true : undefined}
        />
      </FormField>
      <FormField
        label="Achievement (₹)"
        htmlFor="figures-achieved"
        error={errors.achieved}
        hint="What they sold in the month, as you know it. Zero is allowed."
      >
        <Input
          id="figures-achieved"
          inputMode="decimal"
          value={achieved}
          onChange={(e) => setAchieved(e.target.value)}
          aria-invalid={errors.achieved ? true : undefined}
        />
      </FormField>
      {errors.form ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {errors.form}
        </p>
      ) : null}
    </FormDialog>
  );
}
