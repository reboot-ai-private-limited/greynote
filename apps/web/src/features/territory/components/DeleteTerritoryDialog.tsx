'use client';

import type { TerritoryDeleteImpactDto } from '@greynote/contracts';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import type { TerritorySegment } from '@/lib/api/endpoints/territory';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDeleteImpact, useDeleteTerritory } from '../hooks/useTerritoryDelete';

const NOUN: Record<TerritorySegment, string> = { zones: 'zone', hqs: 'HQ', routes: 'route' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The warning lines for what a delete would take and touch. Only what is not zero is shown. */
export function impactLines(impact: TerritoryDeleteImpactDto): {
  takes: string[];
  touches: string[];
  stays: string[];
} {
  const { alsoDeleted, people, references } = impact;
  const takes = [
    alsoDeleted.hqs > 0 ? plural(alsoDeleted.hqs, 'HQ') : '',
    alsoDeleted.routes > 0 ? plural(alsoDeleted.routes, 'route') : '',
  ].filter(Boolean);
  const touches = [
    people.routes > 0
      ? `${plural(people.routes, 'employee')} lose${people.routes === 1 ? 's' : ''} a route (their assignment ends)`
      : '',
    people.hq > 0
      ? `${plural(people.hq, 'employee')} lose${people.hq === 1 ? 's' : ''} their main HQ and will need a new one`
      : '',
    people.coverage > 0
      ? `${plural(people.coverage, 'employee')} cover${people.coverage === 1 ? 's' : ''} it and lose that coverage`
      : '',
  ].filter(Boolean);
  const stays = [
    references.doctors > 0 ? `${plural(references.doctors, 'doctor')} will need a new route` : '',
    references.chemists > 0
      ? `${plural(references.chemists, 'chemist')} will need a new route`
      : '',
    references.distributors > 0
      ? `${plural(references.distributors, 'distributor')} lose${references.distributors === 1 ? 's' : ''} a route`
      : '',
    references.holidays > 0
      ? `${plural(references.holidays, 'holiday')} point${references.holidays === 1 ? 's' : ''} at it`
      : '',
    references.plannedDays > 0
      ? `${plural(references.plannedDays, 'planned day')} from today use${references.plannedDays === 1 ? 's' : ''} these routes`
      : '',
  ].filter(Boolean);
  return { takes, touches, stays };
}

/**
 * The warning before a permanent delete (decision-log 2026-10-16): what it takes with it, the people it touches and the records that stay and
 * need attention. It warns, it does not block. A Zone or HQ asks for its name to be typed, since it cannot be undone.
 */
export function DeleteTerritoryDialog({
  segment,
  item,
  onClose,
  onDeleted,
}: {
  segment: TerritorySegment;
  item: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const noun = NOUN[segment];
  const [typed, setTyped] = useState('');
  const impact = useDeleteImpact(segment, item?.id ?? null);
  const remove = useDeleteTerritory(segment, () => {
    setTyped('');
    onClose();
    onDeleted?.();
  });
  const needsName = segment !== 'routes';
  const confirmed =
    !needsName || typed.trim().toLowerCase() === (item?.name ?? '').trim().toLowerCase();
  const lines = impact.data ? impactLines(impact.data) : null;

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          setTyped('');
          onClose();
        }
      }}
      title={`Delete ${noun} permanently`}
      description={
        item ? `“${item.name}” will be removed for good. This cannot be undone.` : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!impact.data || !confirmed || remove.isPending}
            onClick={() => item && remove.mutate(item.id)}
          >
            {remove.isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </>
      }
    >
      {impact.isLoading ? (
        <p className="text-[13px] text-text-subtle">Checking what this affects…</p>
      ) : impact.error ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {toErrorState(impact.error).message}
        </p>
      ) : lines ? (
        <div className="space-y-4 text-sm">
          {lines.takes.length > 0 ? (
            <Section title="Also deleted">
              <li>{lines.takes.join(' and ')}</li>
              {impact.data && impact.data.alsoDeletedNames.length > 0 ? (
                <li className="text-xs text-text-subtle">
                  {impact.data.alsoDeletedNames.join(', ')}
                  {impact.data.alsoDeleted.hqs + impact.data.alsoDeleted.routes >
                  impact.data.alsoDeletedNames.length
                    ? ' …'
                    : ''}
                </li>
              ) : null}
            </Section>
          ) : null}
          {lines.touches.length > 0 ? (
            <Section title="People affected">
              {lines.touches.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </Section>
          ) : null}
          {lines.stays.length > 0 ? (
            <Section title="Stays, and needs attention">
              {lines.stays.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </Section>
          ) : null}
          {lines.takes.length + lines.touches.length + lines.stays.length === 0 ? (
            <p className="text-text-muted">Nothing else uses it.</p>
          ) : (
            <p className="text-[13px] text-text-subtle">
              Past calls, plans, TA and reports keep working and show the old name.
            </p>
          )}
          {needsName ? (
            <div>
              <label
                htmlFor="delete-confirm"
                className="mb-1.5 block text-sm font-medium text-text"
              >
                Type “{item?.name}” to confirm
              </label>
              <Input
                id="delete-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-text">{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-text-muted">{children}</ul>
    </div>
  );
}
