'use client';

import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { useSession } from '@/lib/auth/SessionProvider';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useSettings } from '../hooks/useSettings';
import { groupSettings, invalidSettings, searchSettings } from '../lib/settings';
import { FinancialYearCard } from './FinancialYearCard';
import { SettingRow } from './SettingRow';

/** The system-wide settings every module reads: deadlines, limits, switches. Admin only. */
export function SettingsScreen() {
  const role = useSession().user?.role;
  const readOnly = useIsReadOnly();
  const { values, update } = useFilterParams(['q']);
  const [term, setTerm] = useSearchFilter(values.q, (v) => update({ q: v }));
  const query = useSettings();
  const all = query.data ?? [];
  const shown = searchSettings(all, values.q);
  const groups = groupSettings(shown);
  const broken = invalidSettings(all);

  if (role !== 'ADMIN') {
    return (
      <>
        <PageHeader title="System settings" />
        <p className="rounded-lg border border-border bg-surface-subtle p-6 text-sm text-text-muted">Only an Admin can see or change the system settings.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="System settings"
        description="Deadlines, limits and switches every part of the system reads. A change applies from the next time it is read; nothing already recorded is rewritten."
      />
      {readOnly ? (
        <p role="status" className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          A past financial year is open, so settings are read-only. Switch the financial year back to Current to change them.
        </p>
      ) : null}
      {broken > 0 ? (
        <p role="alert" className="mb-6 rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg">
          {broken} {broken === 1 ? 'setting holds' : 'settings hold'} a value that breaks {broken === 1 ? 'its' : 'their'} rules, so the system fails whenever it reads {broken === 1 ? 'it' : 'them'}. They are marked below: save a valid value for each.
        </p>
      ) : null}
      <div className="mb-6">
        <FinancialYearCard readOnly={readOnly} />
      </div>
      <div className="mb-6 max-w-md">
        <Input aria-label="Search settings" placeholder="Search settings" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      <TopProgressBar active={query.isFetching && !query.isLoading} />
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={groups.length === 0}
        empty={{ title: 'No settings match', description: all.length === 0 ? 'No settings were found.' : 'Try another word.' }}
      >
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g.module} title={g.label}>
              <ul className="divide-y divide-border">
                {g.items.map((s) => (
                  // Keyed by the stored value too, so a save (or a change made elsewhere) restarts the row's draft from what is now stored.
                  <SettingRow key={`${s.key}:${s.value}`} setting={s} readOnly={readOnly} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </DataState>
    </>
  );
}
