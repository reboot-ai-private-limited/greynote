'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { ManagerPickerDialog } from '@/features/people/components/ManagerPickerDialog';
import { useSession } from '@/lib/auth/SessionProvider';
import { useEligibleEmployees } from '../hooks/useLateGrants';

/**
 * The employees a bulk exception is for. Add one at a time, add a manager's whole team, or (Admin) everyone active; each is a chip that
 * can be taken off again before sending. A manager's shortcut is their own team.
 */
export function EmployeeListField({ value, onChange, error }: { value: string[]; onChange: (userIds: string[]) => void; error?: string | undefined }) {
  const { user } = useSession();
  const isAdmin = user?.role === 'ADMIN';
  const [picking, setPicking] = useState<'one' | 'team' | null>(null);
  const add = (ids: string[]) => onChange([...new Set([...value, ...ids])]);
  const fetchTeam = useEligibleEmployees(add);

  return (
    <FormField label="Employees" htmlFor="grant-users" error={error} hint={value.length > 0 ? `${value.length} chosen` : 'Add people one by one, or a whole team.'}>
      <div id="grant-users" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPicking('one')}>
            Add an employee
          </Button>
          {isAdmin ? (
            <Button variant="secondary" size="sm" onClick={() => setPicking('team')}>
              Add a manager’s team
            </Button>
          ) : user ? (
            <Button variant="secondary" size="sm" disabled={fetchTeam.isPending} onClick={() => fetchTeam.mutate({ scope: 'team', managerId: user.id })}>
              Add my team
            </Button>
          ) : null}
          {isAdmin ? (
            <Button variant="secondary" size="sm" disabled={fetchTeam.isPending} onClick={() => fetchTeam.mutate({ scope: 'all' })}>
              Add everyone active
            </Button>
          ) : null}
          {value.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear all
            </Button>
          ) : null}
        </div>
        {value.length > 0 ? (
          <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {value.map((id) => (
              <li key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-xs">
                <EmployeeName userId={id} />
                <button type="button" aria-label="Take this employee off the list" className="text-text-subtle hover:text-text" onClick={() => onChange(value.filter((v) => v !== id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {picking ? (
        <ManagerPickerDialog
          title={picking === 'one' ? 'Choose an employee' : 'Choose the manager whose team to add'}
          label={picking === 'one' ? 'Employee' : 'Manager'}
          onClose={() => setPicking(null)}
          onPick={(u) => {
            if (picking === 'one') add([u.id]);
            else fetchTeam.mutate({ scope: 'team', managerId: u.id });
            setPicking(null);
          }}
        />
      ) : null}
    </FormField>
  );
}
