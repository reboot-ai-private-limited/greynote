'use client';

import type { SalesMonthDto } from '@greynote/contracts';
import { chartValues, formatMetric, layoutBars, monthTick, type Metric } from '../lib/salesChart';

const SIZE = { width: 760, height: 320, left: 64, right: 12, top: 12, bottom: 34 };

const longMonth = (month: string): string => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * The financial year as a grouped bar chart: for each month, a **primary** bar (Done orders to distributors) beside a **secondary** bar (what the
 * distributors sold on). Drawn by hand as SVG, in the portal's colours. A month whose stock counts are incomplete has a hatched secondary bar; a
 * future month, or one with no count, has no secondary bar at all rather than a zero. Every bar's number is in the table under the chart, and each
 * month can be opened with the keyboard.
 */
export function SalesBarChart({ months, metric, selected, onSelect }: { months: readonly SalesMonthDto[]; metric: Metric; selected: string; onSelect: (month: string) => void }) {
  const layout = layoutBars(months, metric, SIZE);
  const summary = months
    .filter((m) => m.state !== 'FUTURE')
    .map((m) => {
      const v = chartValues(m, metric);
      return `${longMonth(m.month)}: primary ${v.primary === null ? 'none' : formatMetric(v.primary, metric)}, secondary ${v.secondary === null ? 'not available' : formatMetric(v.secondary, metric)}`;
    })
    .join('. ');

  return (
    <figure>
      <svg viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} role="img" aria-label={`Primary and secondary sales by month. ${summary}`} className="h-auto w-full">
        <defs>
          <pattern id="secondary-partial" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-surface" />
            <rect width="3" height="6" className="fill-warning" />
          </pattern>
        </defs>

        {layout.ticks.map((t) => (
          <g key={t.value}>
            <line x1={SIZE.left} x2={SIZE.width - SIZE.right} y1={t.y} y2={t.y} className={t.value === 0 ? 'stroke-border-strong' : 'stroke-border'} strokeWidth={1} />
            <text x={SIZE.left - 8} y={t.y} textAnchor="end" dominantBaseline="middle" className="fill-text-subtle text-[11px] tabular-nums">
              {formatMetric(t.value, metric)}
            </text>
          </g>
        ))}

        {layout.groups.map((g) => {
          const m = months.find((x) => x.month === g.month)!;
          const v = chartValues(m, metric);
          const isSelected = g.month === selected;
          const open = m.state !== 'FUTURE';
          return (
            <g
              key={g.month}
              role={open ? 'button' : undefined}
              tabIndex={open ? 0 : undefined}
              aria-label={open ? `${longMonth(g.month)}: primary ${v.primary === null ? 'none' : formatMetric(v.primary, metric)}, secondary ${v.secondary === null ? 'not available' : formatMetric(v.secondary, metric)}. Open the statement.` : undefined}
              aria-pressed={open ? isSelected : undefined}
              onClick={open ? () => onSelect(g.month) : undefined}
              onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(g.month)) : undefined}
              className={open ? 'cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-accent' : undefined}
            >
              <rect x={g.slot.x} y={g.slot.y} width={g.slot.width} height={g.slot.height} className={isSelected ? 'fill-accent-soft' : 'fill-transparent'} rx={4} stroke="transparent" strokeWidth={2} />
              {g.primary ? (
                <rect x={g.primary.x} y={g.primary.y} width={g.primary.width} height={g.primary.height} className="fill-accent" rx={2}>
                  <title>{`${longMonth(g.month)} · primary ${v.primary === null ? '' : formatMetric(v.primary, metric)}`}</title>
                </rect>
              ) : null}
              {g.secondary ? (
                <rect
                  x={g.secondary.x}
                  y={g.secondary.y}
                  width={g.secondary.width}
                  height={g.secondary.height}
                  rx={2}
                  className={m.complete ? 'fill-warning' : 'stroke-warning'}
                  fill={m.complete ? undefined : 'url(#secondary-partial)'}
                  strokeWidth={m.complete ? 0 : 1}
                >
                  <title>{`${longMonth(g.month)} · secondary ${v.secondary === null ? '' : formatMetric(v.secondary, metric)}${m.complete ? '' : ' (not every distributor counted)'}`}</title>
                </rect>
              ) : null}
              <text x={g.centerX} y={SIZE.height - 12} textAnchor="middle" className={`text-[11px] ${isSelected ? 'fill-text font-semibold' : 'fill-text-subtle'}`}>
                {monthTick(g.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <rect width="12" height="12" rx="2" className="fill-accent" />
          </svg>
          Primary: Done orders to distributors
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <rect width="12" height="12" rx="2" className="fill-warning" />
          </svg>
          Secondary: what the distributors sold on
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <rect width="12" height="12" rx="2" fill="url(#secondary-partial)" className="stroke-warning" />
          </svg>
          Hatched: not every distributor counted
        </span>
      </figcaption>
    </figure>
  );
}
