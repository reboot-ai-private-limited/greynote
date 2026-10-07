import type { DcrFiguresDto } from '@greynote/contracts';
import { confirmedPercent } from '../lib/dcr';

/**
 * How the server's geofence judged the calls: a segmented bar of passed, overridden by a manager, unverified and failed, with the share it confirmed in
 * words beside it. Colour is never the only carrier: the numbers are in the tooltip and the text.
 */
export function GeofenceBar({ figures }: { figures: Pick<DcrFiguresDto, 'calls' | 'geofence'> }) {
  const { pass, override, unverified, fail } = figures.geofence;
  const percent = confirmedPercent(figures);
  if (percent === null) return <span className="text-text-subtle">—</span>;
  const segments = [
    { label: 'Passed', n: pass, className: 'bg-success' },
    { label: 'Overridden by a manager', n: override, className: 'bg-accent' },
    { label: 'Unverified', n: unverified, className: 'bg-warning' },
    { label: 'Failed', n: fail, className: 'bg-danger' },
  ];
  const title = segments.map((s) => `${s.label}: ${s.n}`).join(' · ');
  return (
    <div className="flex items-center gap-2" title={title}>
      <div role="img" aria-label={`${percent}% of calls confirmed. ${title}`} className="flex h-2 w-28 overflow-hidden rounded-full bg-surface-hover">
        {segments.map((s) => (s.n > 0 ? <div key={s.label} className={s.className} style={{ width: `${(s.n / figures.calls) * 100}%` }} /> : null))}
      </div>
      <span className="text-xs tabular-nums text-text-muted">{percent}%</span>
    </div>
  );
}
