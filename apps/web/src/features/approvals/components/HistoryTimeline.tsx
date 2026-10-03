import type { ApprovalActionDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/format';
import { actionLabel, actionTone, groupByCycle } from '../lib/approvals';

/** Everything that happened to a request, grouped by submission round with the newest round first. */
export function HistoryTimeline({ history, currentCycle }: { history: readonly ApprovalActionDto[]; currentCycle: number }) {
  const groups = groupByCycle(history);
  return (
    <div className="space-y-6">
      {groups.map(({ cycle, actions }) => (
        <section key={cycle} aria-label={`Round ${cycle}`}>
          {groups.length > 1 ? (
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-subtle">
              Round {cycle}
              {cycle === currentCycle ? ' · current' : ''}
            </h3>
          ) : null}
          <ol className="space-y-4 border-l border-border pl-5">
            {actions.map((a) => (
              <li key={`${a.at}-${a.action}-${a.actor?.id ?? ''}`} className="relative">
                <span aria-hidden className="absolute -left-[1.6rem] top-1.5 size-2 rounded-full bg-border-strong" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={actionTone(a.action)}>{actionLabel(a)}</Badge>
                  <span className="text-sm font-medium text-text">{a.actor?.name ?? 'Unknown'}</span>
                  <span className="text-xs text-text-subtle">{formatDateTime(a.at)}</span>
                </div>
                {a.comment ? <p className="mt-1.5 rounded-md bg-surface-subtle px-3 py-2 text-sm text-text-muted">“{a.comment}”</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
