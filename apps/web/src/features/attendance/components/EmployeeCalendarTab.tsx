'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Select } from '@/components/ui/Select';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useAttendanceMonth } from '../hooks/useAttendance';
import { STATUS_LABEL, STATUS_ORDER, deductionNote, monthsInYear } from '../lib/attendance';
import { MonthCalendar } from './MonthCalendar';
import { StatusLegend } from './StatusLegend';

/** An employee's month, day by day, with the counts and what payroll would deduct. The month follows the financial year in view. */
export function EmployeeCalendarTab({ userId }: { userId: string }) {
  const { year } = useFinancialYear();
  const today = istDate();
  const months = monthsInYear(year ?? financialYearOf(today), today);
  const [chosen, setChosen] = useState('');
  const month = months.includes(chosen) ? chosen : (months[0] ?? '');
  const query = useAttendanceMonth(userId, month);
  const m = query.data;

  return (
    <Card
      title={month ? monthLabel(month) : 'Calendar'}
      description="Each working day as present, absent, leave, strike, holiday or weekly off. A day counts as absent once it is over, with no report, leave or strike."
      actions={
        months.length > 0 ? (
          <div className="w-48">
            <Select aria-label="Month" value={month} options={months.map((v) => ({ value: v, label: monthLabel(v) }))} onValueChange={setChosen} />
          </div>
        ) : null
      }
    >
      <div className="space-y-4 p-5">
        {months.length === 0 ? (
          <p className="text-sm text-text-muted">No month of this financial year has started yet.</p>
        ) : (
          <DataState
            isLoading={query.isLoading}
            error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
            isEmpty={!m}
            empty={{ title: 'No calendar' }}
          >
            {m ? (
              <>
                <StatusLegend showUnknown={m.counts.UNKNOWN > 0} />
                <MonthCalendar days={m.days} />
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {STATUS_ORDER.map((s) => (
                    <div key={s} className="flex gap-1.5">
                      <dt className="text-text-subtle">{STATUS_LABEL[s]}</dt>
                      <dd className="font-medium tabular-nums">{m.counts[s]}</dd>
                    </div>
                  ))}
                </dl>
                {m.counts.UNKNOWN > 0 ? (
                  <p role="alert" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                    No date of joining is recorded, so {m.counts.UNKNOWN} past working {m.counts.UNKNOWN === 1 ? 'day' : 'days'} cannot be called present or absent and none is deducted. Set the date of joining on the Profile tab.
                  </p>
                ) : null}
                <p role="status" className={m.deductibleDays > 0 ? 'rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg' : 'text-sm text-text-muted'}>
                  {deductionNote(m)} A day shown absent can be turned into leave (Leave tab) until payroll for the month is finalized.
                </p>
              </>
            ) : null}
          </DataState>
        )}
      </div>
    </Card>
  );
}
