'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { sectionTone, type SettingGroup } from '../lib/settings';

/** One module's settings: a pale-coloured header that folds the section open and shut, over rows in a faint tint of the same colour. The count and the High-impact count are words, not only colour. */
export function SettingSection({ group, open, onToggle, children }: { group: SettingGroup; open: boolean; onToggle: () => void; children: ReactNode }) {
  const high = group.items.filter((s) => s.impact === 'HIGH').length;
  const broken = group.items.filter((s) => !s.valid).length;
  const bodyId = `settings-${group.module}`;
  const tone = sectionTone(group.module);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className={cn('flex w-full items-center gap-3 border-l-4 px-5 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent', tone.header)}
        >
          <svg aria-hidden viewBox="0 0 20 20" className={cn('size-4 shrink-0 transition-transform', tone.chevron, open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4l6 6-6 6" />
          </svg>
          <span className="min-w-0 flex-1 text-[15px] font-semibold">{group.label}</span>
          {broken > 0 ? <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">{broken} invalid</span> : null}
          {high > 0 ? <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', tone.chip)}>{high} high impact</span> : null}
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', tone.chip)}>{group.items.length} {group.items.length === 1 ? 'setting' : 'settings'}</span>
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className={tone.body}>
        {children}
      </div>
    </section>
  );
}
