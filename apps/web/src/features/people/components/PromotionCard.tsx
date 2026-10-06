'use client';

import type { PromotionDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate, formatMoney } from '@/lib/format';
import { useCancelPromotion } from '../hooks/usePromotions';
import { PROMOTION_STATUS_LABEL, PROMOTION_STATUS_TONE, changeSummary, monthStartLabel } from '../lib/promotion';

/**
 * One promotion: when it takes effect, what changes, what happens to the team, and anything HR still has to look at. A scheduled one
 * can be cancelled (nothing had changed yet, so nothing is undone).
 */
export function PromotionCard({ promotion: p, showEmployee = false, canCancel = false }: { promotion: PromotionDto; showEmployee?: boolean; canCancel?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelPromotion(() => setConfirming(false));
  const changes = changeSummary(p.from, p.to);
  const stays = p.team.filter((t) => t.stays).length;
  const moved = p.team.length - stays;

  return (
    <article className="rounded-lg border border-border bg-surface p-5" aria-label={`Promotion from ${monthStartLabel(p.effectiveFrom)}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-text">
            {showEmployee && p.employee ? (
              <>
                <Link href={`/employees/${p.employee.id}`} className="hover:text-accent hover:underline">
                  {p.employee.name}
                </Link>{' '}
                <span className="font-normal text-text-subtle">({p.employee.employeeCode})</span> ·{' '}
              </>
            ) : null}
            From {monthStartLabel(p.effectiveFrom)}
          </p>
          <p className="mt-0.5 text-[13px] text-text-subtle">
            Scheduled {formatDate(p.createdAt)}
            {p.appliedAt ? ` · applied ${formatDate(p.appliedAt)}` : ''}
            {p.cancelledAt ? ` · cancelled ${formatDate(p.cancelledAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={PROMOTION_STATUS_TONE[p.status]}>{PROMOTION_STATUS_LABEL[p.status]}</Badge>
          {canCancel && p.status === 'SCHEDULED' ? (
            <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </header>

      <ul className="mt-3 space-y-1 text-sm">
        {changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
        {p.ctcAnnualPaise !== null ? <li>New CTC {formatMoney(p.ctcAnnualPaise)} a year</li> : null}
        {p.team.length > 0 ? (
          <li>
            Team of {p.team.length}: {moved > 0 ? `${moved} move${moved === 1 ? 's' : ''} to a new manager` : 'no one moves'}
            {stays > 0 ? `${moved > 0 ? ', ' : ': '}${stays} stay${stays === 1 ? 's' : ''}` : ''}
          </li>
        ) : null}
        {changes.length === 0 && p.ctcAnnualPaise === null && p.team.length === 0 ? <li className="text-text-muted">No change recorded.</li> : null}
      </ul>
      {p.reason ? <p className="mt-2 text-[13px] text-text-muted">Reason: {p.reason}</p> : null}

      {p.attention.length > 0 ? (
        <ul role="status" className="mt-3 space-y-1 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          {p.attention.map((a) => (
            <li key={`${a.kind}:${a.person?.id ?? a.message}`}>
              {a.message}
              {a.person ? (
                <>
                  {' '}
                  <Link href={`/employees/${a.person.id}`} className="font-medium underline">
                    Open {a.person.name}
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Cancel this promotion?"
        description="Nothing about the employee or their team has changed yet, so nothing is undone. To change it, schedule a new one."
        confirmLabel="Cancel the promotion"
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate(p.id)}
      />
    </article>
  );
}
