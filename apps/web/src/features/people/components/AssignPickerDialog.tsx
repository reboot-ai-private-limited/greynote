'use client';

import type { BulkAssignResultDto, UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { toErrorState } from '@/lib/api/toErrorState';
import { useAssignCandidates, useBulkAssign, type PickerKind, type PickerRow } from '../hooks/useAssignPicker';
import { removeNote, resultSummary, reviewNote } from '../lib/assigned';

const WORDS: Record<PickerKind, { one: string; many: string; title: string }> = {
  doctors: { one: 'doctor', many: 'doctors', title: 'Assign doctors' },
  chemists: { one: 'chemist', many: 'chemists', title: 'Assign chemists' },
  distributors: { one: 'distributor', many: 'distributors', title: 'Assign distributors' },
};

/**
 * Manage what one employee holds: doctors, chemists or distributors (decision-log 2026-11-19). The ones they hold now are ticked; tick others to assign them, untick a held one to
 * take it off them. Step 1 picks (search, across pages); step 2 reviews what will be assigned and what will be removed; then a result lists what went through and what was skipped,
 * with the reason. A doctor can only go to an employee who holds its route, so for doctors the list is always theirs; for the others "Only on their routes" can be switched off.
 */
export function AssignPickerDialog({ kind, user, onClose }: { kind: PickerKind; user: UserDetailDto; onClose: () => void }) {
  const words = WORDS[kind];
  const directory = useTerritoryDirectory();
  const [step, setStep] = useState<'pick' | 'review' | 'result'>('pick');
  const [search, setSearch] = useState('');
  const [text, setText] = useSearchFilter(search, (v) => {
    setSearch(v);
    setPage(1);
  });
  const [page, setPage] = useState(1);
  const [onlyTheirs, setOnlyTheirs] = useState(true);
  // Held ones start ticked: `removed` are the held ones unticked, `added` the others ticked.
  const [added, setAdded] = useState<Map<string, PickerRow>>(new Map());
  const [removed, setRemoved] = useState<Map<string, PickerRow>>(new Map());
  const [results, setResults] = useState<BulkAssignResultDto[]>([]);

  const candidates = useAssignCandidates(kind, { employeeId: user.id, search, page, onlyTheirs: kind === 'doctors' ? true : onlyTheirs, routeLabel: directory.routeLabel });
  const assign = useBulkAssign(kind, (r) => {
    setResults(r);
    setStep('result');
  });

  const rows = candidates.data?.items ?? [];
  const holds = (r: PickerRow) => r.holders.some((h) => h.userId === user.id);
  const ticked = (r: PickerRow) => (holds(r) ? !removed.has(r.id) : added.has(r.id));
  const flip = (m: Map<string, PickerRow>, r: PickerRow) => {
    const next = new Map(m);
    if (next.has(r.id)) next.delete(r.id);
    else next.set(r.id, r);
    return next;
  };
  const toggle = (r: PickerRow) => (holds(r) ? setRemoved((m) => flip(m, r)) : setAdded((m) => flip(m, r)));
  const allOnPage = rows.length > 0 && rows.every(ticked);
  const toggleAll = () => rows.filter((r) => ticked(r) === allOnPage).forEach(toggle);
  const toAssign = [...added.values()];
  const toRemove = [...removed.values()];
  const changes = toAssign.length + toRemove.length;
  // Typing waits for the pause (debounce), then the list reloads: show it either way, and keep the old list dimmed meanwhile.
  const searching = text !== search || candidates.isFetching;
  const error = candidates.error ? toErrorState(candidates.error, () => void candidates.refetch()) : null;

  const footer =
    step === 'pick' ? (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={changes === 0} onClick={() => setStep('review')}>
          {changes === 0 ? 'Review changes' : `Review ${changes} ${changes === 1 ? 'change' : 'changes'}`}
        </Button>
      </>
    ) : step === 'review' ? (
      <>
        <Button variant="secondary" disabled={assign.isPending} onClick={() => setStep('pick')}>
          Back
        </Button>
        <Button disabled={assign.isPending} onClick={() => assign.mutate({ userId: user.id, ids: toAssign.map((r) => r.id), removeIds: toRemove.map((r) => r.id) })}>
          {assign.isPending ? 'Saving…' : `Apply: assign ${toAssign.length}, remove ${toRemove.length}`}
        </Button>
      </>
    ) : (
      <Button onClick={onClose}>Done</Button>
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${words.title}: ${user.name}`}
      description={
        step === 'pick'
          ? kind === 'doctors'
            ? 'Ticked doctors are held by this employee now: untick one to take it off them. Tick others to give them; a doctor someone else holds moves here.'
            : `Ticked ${words.many} are held by this employee now: untick one to take it off them. Tick others to give them; others who hold them keep them.`
          : step === 'review'
            ? 'Check the names before assigning.'
            : resultSummary(kind, results)
      }
      wide
      footer={footer}
    >
      {step === 'pick' ? (
        <div className="space-y-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input placeholder={`Search ${words.many} by name`} aria-label={`Search ${words.many}`} value={text} onChange={(e) => setText(e.target.value)} className="max-w-sm" />
            {kind !== 'doctors' ? (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={onlyTheirs}
                  onChange={(e) => {
                    setOnlyTheirs(e.target.checked);
                    setPage(1);
                  }}
                />
                Only on {user.name}&apos;s routes
              </label>
            ) : null}
            {searching ? <span role="status" className="text-[13px] text-text-muted">Searching…</span> : null}
            {changes > 0 ? <Badge tone="accent">{changes} {changes === 1 ? 'change' : 'changes'}</Badge> : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error.title}
            </p>
          ) : candidates.isLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-muted">
              {text !== search ? 'Searching…' : search ? `No ${words.one} matches “${search}”.` : kind === 'doctors' ? `No doctor on ${user.name}'s routes yet. Assign them a route first.` : `No ${words.one} to show.`}
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium text-text">
                <input type="checkbox" checked={allOnPage} onChange={toggleAll} />
                Select all on this page
              </label>
              <ul className={`divide-y divide-border rounded-md border border-border transition-opacity ${searching ? 'opacity-50' : ''}`}>
                {rows.map((r) => {
                  const note = reviewNote(kind, r.holders, user.id);
                  const held = holds(r);
                  const isTicked = ticked(r);
                  return (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-surface-hover">
                        <input type="checkbox" className="mt-1" checked={isTicked} onChange={() => toggle(r)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-text">{r.name}</span>
                          {r.detail ? <span className="block truncate text-[12px] text-text-subtle">{r.detail}</span> : null}
                        </span>
                        <span className={`shrink-0 text-[12px] ${held && !isTicked ? 'font-medium text-danger' : 'text-text-muted'}`}>
                          {held ? (isTicked ? `Held by ${user.name}` : `Will be taken off ${user.name}`) : note.tone === 'free' ? 'Free' : note.text}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between text-[13px] text-text-muted">
                <span>
                  Page {candidates.data?.page ?? 1} of {Math.max(1, candidates.data?.totalPages ?? 1)} · {candidates.data?.total ?? 0} {words.many}
                </span>
                <span className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= (candidates.data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-4 px-6 py-4">
          {toAssign.length > 0 ? (
            <section>
              <p className="mb-2 text-sm text-text">
                {toAssign.length} {toAssign.length === 1 ? words.one : words.many} will be <strong>assigned</strong> to {user.name} ({user.employeeCode}):
              </p>
              <ol className="divide-y divide-border rounded-md border border-border">
                {toAssign.map((r, i) => {
                  const note = reviewNote(kind, r.holders, user.id);
                  return (
                    <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text">
                          {i + 1}. {r.name}
                        </span>
                        {r.detail ? <span className="block truncate text-[12px] text-text-subtle">{r.detail}</span> : null}
                      </span>
                      <Badge tone={note.tone === 'moves' ? 'warning' : 'neutral'}>{note.tone === 'free' ? 'Free' : note.text}</Badge>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
          {toRemove.length > 0 ? (
            <section>
              <p className="mb-2 text-sm text-text">
                {toRemove.length} {toRemove.length === 1 ? words.one : words.many} will be <strong>taken off</strong> {user.name}:
              </p>
              <ol className="divide-y divide-border rounded-md border border-border">
                {toRemove.map((r, i) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">
                        {i + 1}. {r.name}
                      </span>
                      {r.detail ? <span className="block truncate text-[12px] text-text-subtle">{r.detail}</span> : null}
                    </span>
                    <Badge tone="danger">{removeNote(kind, r.holders, user.id)}</Badge>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : null}

      {step === 'result' ? (
        <div className="space-y-2 px-6 py-4">
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {results.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="text-text">{r.name}</span>
                <span className={r.outcome === 'SKIPPED' ? 'text-danger' : 'text-text-muted'}>
                  {r.outcome === 'ASSIGNED' ? 'Assigned' : r.outcome === 'MOVED' ? `Assigned (moved from ${r.from ?? 'the old holder'})` : r.outcome === 'REMOVED' ? 'Taken off' : r.outcome === 'ALREADY' ? 'Already held' : `Skipped: ${r.reason ?? 'could not change'}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}
