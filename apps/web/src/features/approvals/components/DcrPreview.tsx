'use client';

import type { ChemistCallDto, DcrDetailDto, DoctorCallDto } from '@greynote/contracts';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/auth/SessionProvider';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { formatDate, formatMoney } from '@/lib/format';
import { useDcr } from '../hooks/usePreviews';
import {
  EXPENSE_TYPE_LABEL,
  canOverride,
  isFlagged,
  claimedTotalPaise,
  dcrCounts,
  dcrCountsLabel,
  flaggedNotice,
  notInPlanNotice,
  hasDistanceFlag,
  splitExpenses,
  taDaNote,
} from '../lib/review';
import { AcceptCallDialog } from './AcceptCallDialog';
import { CallCard } from './CallCard';
import { PreviewFrame } from './PreviewFrame';

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        {title}
        {count !== undefined ? ` · ${count}` : ''}
      </h3>
      {children}
    </section>
  );
}

/** A daily report: the day's calls with the server's location check, follow-ups and what was claimed. */
export function DcrPreview({ recordId }: { recordId: string }) {
  const query = useDcr(recordId);
  const dcr = query.data;

  return (
    <PreviewFrame
      title="Daily report"
      description="Check the calls and what was claimed before deciding."
      query={query}
    >
      {dcr ? <DcrBody dcr={dcr} /> : null}
    </PreviewFrame>
  );
}

function DcrBody({ dcr }: { dcr: DcrDetailDto }) {
  const role = useSession().user?.role;
  const readOnly = useIsReadOnly();
  const [accepting, setAccepting] = useState<DoctorCallDto | ChemistCallDto | null>(null);
  const mayAccept = canOverride(role, dcr.status);
  const acceptButton = (c: DoctorCallDto | ChemistCallDto) =>
    mayAccept && isFlagged(c) ? (
      <Button
        size="sm"
        variant="secondary"
        disabled={readOnly}
        title={readOnly ? 'A past financial year is read-only' : undefined}
        onClick={() => setAccepting(c)}
      >
        Accept this call
      </Button>
    ) : undefined;
  const notice = flaggedNotice(dcr);
  const unplanned = notInPlanNotice(dcr);
  const { auto, manual } = splitExpenses(dcr.expenses);
  const note = taDaNote(dcr.status, dcr.expenses);

  return (
    <div className="space-y-6 p-5">
      <div>
        <p className="text-sm font-medium text-text">{formatDate(dcr.reportDate)}</p>
        <p className="text-sm text-text-muted">{dcrCountsLabel(dcrCounts(dcr))}</p>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-md border border-warning bg-warning-bg p-3 text-sm text-warning-fg"
        >
          {notice} Each is shown below with what the check found
          {mayAccept ? '; accepting a call is separate from approving the report' : ''}.
        </p>
      ) : null}

      {unplanned ? (
        <p
          role="status"
          className="rounded-md border border-warning bg-warning-bg p-3 text-sm text-warning-fg"
        >
          {unplanned} Each is marked below.
        </p>
      ) : null}

      {dcr.doctorCalls.length > 0 ? (
        <Section title="Doctor calls" count={dcr.doctorCalls.length}>
          <ul className="space-y-3">
            {dcr.doctorCalls.map((c) => (
              <CallCard key={c.id} call={c} action={acceptButton(c)} />
            ))}
          </ul>
        </Section>
      ) : null}

      {dcr.chemistCalls.length > 0 ? (
        <Section title="Chemist calls" count={dcr.chemistCalls.length}>
          <ul className="space-y-3">
            {dcr.chemistCalls.map((c) => (
              <CallCard key={c.id} call={c} action={acceptButton(c)} />
            ))}
          </ul>
        </Section>
      ) : null}

      {dcr.followups.length > 0 ? (
        <Section title="Follow-ups" count={dcr.followups.length}>
          <ul className="divide-y divide-border rounded-md border border-border">
            {dcr.followups.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <p className="text-sm font-medium text-text">
                  {f.subjectName || 'Unknown'}{' '}
                  <span className="font-normal text-text-subtle">
                    · {f.subject === 'DOCTOR' ? 'doctor' : 'chemist'}
                  </span>
                </p>
                <p className="mt-1 text-sm text-text-muted">{f.remarks}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Expenses">
        {dcr.expenses.length === 0 ? (
          <p className="text-sm text-text-muted">{note ?? 'No expenses.'}</p>
        ) : (
          <div className="space-y-2">
            <ul className="divide-y divide-border rounded-md border border-border">
              {[...auto, ...manual].map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-text">
                      {EXPENSE_TYPE_LABEL[e.type]}
                      {e.source === 'AUTO' ? <Badge tone="neutral">Calculated</Badge> : null}
                      {e.distanceFlag ? (
                        <Badge tone="warning">Distance not calculated</Badge>
                      ) : null}
                      {e.paymentStatus === 'CANCELLED' ? (
                        <Badge tone="neutral">Cancelled</Badge>
                      ) : null}
                    </p>
                    {e.remarks ? <p className="text-xs text-text-subtle">{e.remarks}</p> : null}
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {formatMoney(e.amountPaise)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between px-1 text-sm">
              <span className="text-text-muted">Claimed</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(claimedTotalPaise(dcr.expenses))}
              </span>
            </p>
            {hasDistanceFlag(dcr.expenses) ? (
              <p className="text-[13px] text-warning-fg">
                A route&apos;s distance could not be calculated, so its travel allowance is lower
                than it should be. Check it before approving.
              </p>
            ) : null}
            {note ? <p className="text-[13px] text-text-subtle">{note}</p> : null}
          </div>
        )}
      </Section>
      {accepting ? (
        <AcceptCallDialog dcrId={dcr.id} call={accepting} onClose={() => setAccepting(null)} />
      ) : null}
    </div>
  );
}
