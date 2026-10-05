import type { CtcLineDto } from '@greynote/contracts';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/format';
import { monthlyOf } from '../lib/ctc';

/**
 * A saved or previewed CTC split, annual and monthly: what the employee is paid, then what the employer puts in on top
 * (inside the CTC), then the CTC itself.
 */
export function CtcBreakdownTable({ lines, ctcAnnualPaise }: { lines: readonly CtcLineDto[]; ctcAnnualPaise: number }) {
  const earnings = lines.filter((l) => l.kind === 'EARNING');
  const employer = lines.filter((l) => l.kind === 'EMPLOYER_CONTRIBUTION');
  const sum = (ls: readonly CtcLineDto[]) => ls.reduce((s, l) => s + l.amountPaise, 0);
  const row = (key: string, label: ReactNode, annual: number, strong = false) => (
    <tr key={key} className={strong ? 'border-t border-border font-medium' : undefined}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(annual)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(monthlyOf(annual))}</td>
    </tr>
  );
  const lineLabel = (l: CtcLineDto) => (
    <span className="flex items-center gap-2">
      {l.name}
      {l.isOverridden ? <Badge tone="accent">Edited</Badge> : null}
    </span>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-text-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Component</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Per year</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Per month</th>
          </tr>
        </thead>
        <tbody>
          {earnings.map((l) => row(l.code, lineLabel(l), l.amountPaise))}
          {row('gross', 'Paid to the employee', sum(earnings), true)}
          {employer.map((l) => row(l.code, lineLabel(l), l.amountPaise))}
          {row('ctc', 'CTC', ctcAnnualPaise, true)}
        </tbody>
      </table>
    </div>
  );
}
