'use client';

import type { SalaryMonthDto } from '@greynote/contracts';
import { compactRupees, monthTick } from '../lib/salesChart';
import { layoutStacks, STACK_SERIES, type StackView } from '../lib/stackChart';

const SIZE = { width: 760, height: 320, left: 64, right: 12, top: 12, bottom: 34 };

const longMonth = (month: string): string => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * The financial year as stacked bars, one per month: net salary with the month's TA, DA and reimbursements on top (what the field force cost), or the
 * deductions (unpaid leave and absent days). A month of draft runs is drawn hatched and is not in the finalized figures. Hand-drawn SVG, in the
 * portal's colours; every number is in the table beside it.
 */
export function SalaryStackChart({ months, view, selected, onSelect }: { months: readonly SalaryMonthDto[]; view: StackView; selected: string; onSelect: (month: string) => void }) {
  const layout = layoutStacks(months, view, SIZE);
  const series = STACK_SERIES[view];
  const summary = layout.groups
    .filter((g) => g.total > 0)
    .map((g) => `${longMonth(g.month)}: ${compactRupees(g.total)} (${g.segments.map((s) => `${s.series.label} ${compactRupees(s.value)}`).join(', ')})`)
    .join('. ');

  return (
    <figure>
      <svg viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} role="img" aria-label={`${view === 'COST' ? 'What the field force cost' : 'Deductions'} by month. ${summary}`} className="h-auto w-full">
        <defs>
          <pattern id="stack-draft" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-surface" />
            <rect width="3" height="6" className="fill-accent" />
          </pattern>
        </defs>
        {layout.ticks.map((t) => (
          <g key={t.value}>
            <line x1={SIZE.left} x2={SIZE.width - SIZE.right} y1={t.y} y2={t.y} className={t.value === 0 ? 'stroke-border-strong' : 'stroke-border'} strokeWidth={1} />
            <text x={SIZE.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle" className="fill-text-subtle text-[11px] tabular-nums">
              {compactRupees(t.value)}
            </text>
          </g>
        ))}
        {layout.groups.map((g) => {
          const m = months.find((x) => x.month === g.month)!;
          const open = m.state !== 'FUTURE';
          const isSelected = g.month === selected;
          return (
            <g
              key={g.month}
              role={open ? 'button' : undefined}
              tabIndex={open ? 0 : undefined}
              aria-label={open ? `${longMonth(g.month)}: ${compactRupees(g.total)}. Show this month.` : undefined}
              aria-pressed={open ? isSelected : undefined}
              onClick={open ? () => onSelect(g.month) : undefined}
              onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(g.month)) : undefined}
              className={open ? 'cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-accent' : undefined}
            >
              <rect x={g.slot.x} y={g.slot.y} width={g.slot.width} height={g.slot.height} className={isSelected ? 'fill-accent-soft' : 'fill-transparent'} rx={4} stroke="transparent" strokeWidth={2} />
              {g.segments.map((s) => (
                <rect key={s.series.key} x={s.rect.x} y={s.rect.y} width={s.rect.width} height={s.rect.height} rx={1} className={s.series.hatched ? 'stroke-accent' : s.series.className} fill={s.series.hatched ? 'url(#stack-draft)' : undefined} strokeWidth={s.series.hatched ? 1 : 0}>
                  <title>{`${longMonth(g.month)} · ${s.series.label} ${compactRupees(s.value)}`}</title>
                </rect>
              ))}
              <text x={g.centerX} y={SIZE.height - 12} textAnchor="middle" className={`text-[11px] ${isSelected ? 'fill-text font-semibold' : 'fill-text-subtle'}`}>
                {monthTick(g.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <rect width="12" height="12" rx="2" className={s.hatched ? 'stroke-accent' : s.className} fill={s.hatched ? 'url(#stack-draft)' : undefined} />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
