'use client';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { useSession } from '@/lib/auth/SessionProvider';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { groupSettings, invalidSettings, searchSettings } from '../lib/settings';
import { FinancialYearCard } from './FinancialYearCard';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';

const OPEN_KEY = 'greynote.settings.open';

/** Which sections the person folded open last time. Browser storage can be missing or blocked: then every section just starts at its default. */
function readOpen(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function saveOpen(open: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify(open));
  } catch {
    /* not remembered: fine */
  }
}

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
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => (typeof window === 'undefined' ? {} : readOpen()));
  const searching = values.q.trim() !== '';
  // A section the person folded keeps their choice; otherwise it starts open only when a search matched in it or it holds an invalid value.
  const isOpen = (g: (typeof groups)[number]) => (searching ? true : (chosen[g.module] ?? g.items.some((x) => !x.valid)));
  const setAll = (open: boolean) => {
    const next = Object.fromEntries(groups.map((g) => [g.module, open]));
    setChosen((c) => ({ ...c, ...next }));
    saveOpen({ ...chosen, ...next });
  };
  const toggle = (g: (typeof groups)[number]) => {
    const next = { ...chosen, [g.module]: !isOpen(g) };
    setChosen(next);
    saveOpen(next);
  };

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
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-md">
          <Input aria-label="Search settings" placeholder="Search settings" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Expand all</Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(false)}>Collapse all</Button>
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
            <SettingSection key={g.module} group={g} open={isOpen(g)} onToggle={() => toggle(g)}>
              <ul className="divide-y divide-border">
                {g.items.map((s) => (
                  // Keyed by the stored value too, so a save (or a change made elsewhere) restarts the row's draft from what is now stored.
                  <SettingRow key={`${s.key}:${s.value}`} setting={s} readOnly={readOnly} />
                ))}
              </ul>
            </SettingSection>
          ))}
        </div>
      </DataState>
    </>
  );
}
