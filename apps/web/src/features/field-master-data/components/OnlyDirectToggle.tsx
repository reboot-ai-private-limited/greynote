'use client';

import { Button } from '@/components/ui/Button';

/**
 * Shown next to the "Anyone assigned" filter once an employee is picked. Off (the default), a manager counts what the people below them hold, as on the
 * phone (decision-log 2026-11-19); on, only what they hold themselves.
 */
export function OnlyDirectToggle({ employeeId, on, onChange }: { employeeId: string | undefined; on: boolean; onChange: (on: boolean) => void }) {
  if (!employeeId) return null;
  return (
    <Button variant={on ? 'primary' : 'secondary'} aria-pressed={on} title="Off: a manager also shows what their team holds, as on the phone" onClick={() => onChange(!on)}>
      Only direct
    </Button>
  );
}
