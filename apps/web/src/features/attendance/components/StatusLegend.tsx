import { CELL_CLASS, STATUS_CODE, STATUS_LABEL, STATUS_ORDER } from '../lib/attendance';
import { cn } from '@/components/ui/cn';

/** What each colour and letter on a calendar means. */
export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-text-muted" aria-label="Legend">
      {STATUS_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('inline-flex size-6 items-center justify-center rounded text-xs font-semibold', CELL_CLASS[s])}>
            {STATUS_CODE[s]}
          </span>
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}
