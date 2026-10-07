import type { AttendanceDayDto } from '@greynote/contracts';
import { cn } from '@/components/ui/cn';
import { CELL_CLASS, STATUS_CODE, STATUS_LABEL, leadingBlanks } from '../lib/attendance';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A month as a grid of days, Monday first. Each day shows its number and a letter for its status, and says it in words to a screen reader. */
export function MonthCalendar({ days }: { days: readonly AttendanceDayDto[] }) {
  const first = days[0];
  return (
    <div role="grid" aria-label="Month calendar" className="grid grid-cols-7 gap-1.5 text-sm">
      {WEEKDAYS.map((d) => (
        <div key={d} role="columnheader" className="px-1 pb-1 text-center text-xs font-medium uppercase tracking-wide text-text-subtle">
          {d}
        </div>
      ))}
      {days.map((cell) => (
        <div
          key={cell.date}
          role="gridcell"
          aria-label={`${cell.date}: ${STATUS_LABEL[cell.status]}`}
          title={`${cell.date} · ${STATUS_LABEL[cell.status]}`}
          // The 1st sits under its weekday: the grid skips the columns before it instead of drawing empty cells.
          style={cell === first ? { gridColumnStart: leadingBlanks(cell.date) + 1 } : undefined}
          className={cn('flex h-14 flex-col justify-between rounded-md border border-border px-2 py-1', CELL_CLASS[cell.status])}
        >
          <span className="text-xs tabular-nums">{Number(cell.date.slice(8, 10))}</span>
          <span aria-hidden className="text-right text-sm font-semibold">
            {STATUS_CODE[cell.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
