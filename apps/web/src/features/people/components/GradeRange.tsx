import type { PayBandDto } from '@greynote/contracts';
import { formatMoney } from '@/lib/format';
import { gradeRange } from '../lib/ctc';

/** A grade's CTC range a year as minimum, average and maximum — shown wherever a grade is chosen for an employee. */
export function GradeRange({ band }: { band: Pick<PayBandDto, 'ctcMinAnnualPaise' | 'ctcMaxAnnualPaise'> }) {
  const r = gradeRange(band);
  const cell = (label: string, paise: number) => (
    <span className="flex flex-col">
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="tabular-nums">{formatMoney(paise)}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label="CTC range per year">
      {cell('Minimum', r.min)}
      {cell('Average', r.avg)}
      {cell('Maximum', r.max)}
    </div>
  );
}
