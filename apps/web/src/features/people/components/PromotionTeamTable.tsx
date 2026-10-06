'use client';

import type { PromotionTeamRowDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ManagerPickerDialog } from './ManagerPickerDialog';

/**
 * Who each of the promoted person's direct reports will report to from the effective month. Tick one, several or everyone and choose
 * a manager for the group, or change a single row. "Stay with" keeps them under the promoted person (allowed, with a warning).
 * The promotion cannot be scheduled while anyone is not placed.
 */
export function PromotionTeamTable({
  team,
  promoted,
  moves,
  names,
  onPlace,
  onClear,
}: {
  team: readonly PromotionTeamRowDto[];
  promoted: { id: string; name: string };
  /** Direct report id → the manager they will have. */
  moves: Readonly<Record<string, string>>;
  /** Manager id → name, for the managers chosen so far. */
  names: Readonly<Record<string, string>>;
  /** Put these people under this manager (the promoted person's own id means they stay). */
  onPlace: (userIds: readonly string[], manager: { id: string; name: string }) => void;
  onClear: (userIds: readonly string[]) => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [picking, setPicking] = useState<readonly string[] | null>(null);
  const ids = team.map((t) => t.person.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const chosen = ids.filter((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <span className="text-sm text-text-muted">{chosen.length > 0 ? `${chosen.length} selected` : 'Tick people to place them together'}</span>
        <Button variant="secondary" size="sm" disabled={chosen.length === 0} onClick={() => setPicking(chosen)}>
          Move selected to…
        </Button>
        <Button variant="secondary" size="sm" disabled={chosen.length === 0} onClick={() => onPlace(chosen, promoted)}>
          Selected stay with {promoted.name}
        </Button>
        <Button variant="ghost" size="sm" disabled={chosen.length === 0} onClick={() => onClear(chosen)}>
          Clear
        </Button>
        <span className="ml-auto" />
        <Button variant="secondary" size="sm" onClick={() => setPicking(ids)}>
          Move everyone to…
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-subtle">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select everyone"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(ids))}
                />
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Employee</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Designation</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Will report to</th>
              <th scope="col" className="w-24 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {team.map((row) => {
              const id = row.person.id;
              const to = moves[id];
              return (
                <tr key={id} className="border-t border-border">
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" aria-label={`Select ${row.person.name}`} checked={selected.has(id)} onChange={() => toggle(id)} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{row.person.name}</span> <span className="text-text-subtle">{row.person.employeeCode}</span>
                  </td>
                  <td className="px-3 py-2">{row.person.designation ?? '—'}</td>
                  <td className="px-3 py-2">
                    {!to ? (
                      <Badge tone="warning">Not placed</Badge>
                    ) : to === promoted.id ? (
                      <span>
                        Stays with {promoted.name} <Badge tone="neutral">Stays</Badge>
                      </span>
                    ) : (
                      (names[to] ?? row.toManager?.name ?? '—')
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setPicking([id])} aria-label={`Choose a manager for ${row.person.name}`}>
                      {to ? 'Change' : 'Choose'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {picking ? (
        <ManagerPickerDialog
          selfId={promoted.id}
          title={picking.length === 1 ? 'Choose their new manager' : `Choose a manager for ${picking.length} people`}
          label="New manager"
          onClose={() => setPicking(null)}
          onPick={(u) => {
            onPlace(picking, u);
            setPicking(null);
          }}
        />
      ) : null}
    </div>
  );
}
