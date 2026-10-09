'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { istMonth } from '@/lib/dates';
import { useCtcHistory } from '../hooks/useCtc';
import { CtcBreakdownTable } from './CtcBreakdownTable';
import { inForce } from '../lib/ctc';

/** An employee's CTC: what applies now, what is coming, and every revision so far. */
export function CompensationTab({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const router = useRouter();
  const history = useCtcHistory(user.id);
  const month = istMonth();
  const revisions = history.data ?? [];
  const current = inForce(revisions, month);
  const upcoming = revisions.filter((r) => r.effectiveFrom > month);

  return (
    <div className="space-y-6">
      <Card
        title="CTC"
        description={
          current
            ? `In force since ${current.effectiveFrom}${current.reason ? ` · ${current.reason}` : ''}`
            : 'No CTC is set yet — payroll skips this employee until one is.'
        }
        actions={
          <Button
            size="sm"
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
            onClick={() => router.push(`/employees/${user.id}/ctc`)}
          >
            {current ? 'Revise CTC' : 'Set CTC'}
          </Button>
        }
      >
        <div className="p-5">
          <DataState
            isLoading={history.isLoading}
            error={history.error ? toErrorState(history.error, () => void history.refetch()) : null}
            isEmpty={!current}
            empty={{
              title: 'No CTC yet',
              description: 'Set the yearly CTC and the breakdown fills in from the pay components.',
            }}
          >
            {current ? (
              <>
                <p className="mb-4 text-lg font-semibold tabular-nums">
                  {formatMoney(current.ctcAnnualPaise)}{' '}
                  <span className="text-sm font-normal text-text-muted">a year</span>
                </p>
                <CtcBreakdownTable lines={current.lines} ctcAnnualPaise={current.ctcAnnualPaise} />
              </>
            ) : null}
          </DataState>
          {upcoming.length > 0 ? (
            <p
              role="status"
              className="mt-4 rounded-md bg-surface-subtle px-3 py-2 text-sm text-text-muted"
            >
              Coming up:{' '}
              {upcoming
                .map((r) => `${formatMoney(r.ctcAnnualPaise)} from ${r.effectiveFrom}`)
                .join(', ')}
              .
            </p>
          ) : null}
        </div>
      </Card>

      {revisions.length > 0 ? (
        <Card
          title="History"
          description="Every saved revision. They are never edited; a change is a new one."
        >
          <ul className="divide-y divide-border">
            {revisions.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{formatMoney(r.ctcAnnualPaise)}</span>
                  <span className="text-text-muted">from {r.effectiveFrom}</span>
                  {r.id === current?.id ? <Badge tone="success">In force</Badge> : null}
                  {r.effectiveFrom > month ? <Badge tone="accent">Upcoming</Badge> : null}
                </span>
                <span className="text-text-muted">
                  {r.reason ? `${r.reason} · ` : ''}saved {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
