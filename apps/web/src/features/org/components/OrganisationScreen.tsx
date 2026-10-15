'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { OrgNodeDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { ListToolbar, SearchInput } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { PersonLink } from '@/features/people/components/PersonLink';
import { useDesignations } from '@/features/people/hooks/useMasterData';
import { useUsers } from '@/features/people/hooks/useUsers';
import { ORG_PAGE_SIZE, useOrgChildren } from '../hooks/useOrg';

/** Designations whose team shows without a click: everything above RSM. */
const OPEN_BY_DEFAULT: ReadonlySet<string> = new Set(['NSM', 'ZSM']);

/**
 * The whole reporting tree, one level at a time: the people at the top first, a person's direct reports only when their row is opened,
 * and "Show more" when a level has more than a page. Search lists matches flat; each name opens the employee.
 */
export function OrganisationScreen() {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 300);
  const designations = useDesignations();
  const designationName = new Map((designations.data ?? []).map((d) => [d.id, d.name]));
  const label = (m: { designationId: string | null }) =>
    m.designationId ? (designationName.get(m.designationId) ?? '') : '';

  return (
    <>
      <PageHeader
        title="Organisation"
        description="Who reports to whom. Open a person to see their team; click a name for their profile."
      />
      <ListToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Find by name or employee ID"
          label="Find an employee"
        />
      </ListToolbar>
      <Card>
        {term ? (
          <SearchResults term={term} label={label} />
        ) : (
          <Level parentId={null} depth={0} label={label} />
        )}
      </Card>
    </>
  );
}

function SearchResults({
  term,
  label,
}: {
  term: string;
  label: (m: { designationId: string | null }) => string;
}) {
  const users = useUsers({ page: 1, pageSize: 25, search: term, role: 'FIELD' });
  return (
    <DataState
      isLoading={users.isLoading}
      error={users.error ? toErrorState(users.error, () => void users.refetch()) : null}
      isEmpty={(users.data?.items.length ?? 0) === 0}
      empty={{ title: 'No one found', description: `Nobody matches “${term}”.` }}
    >
      <ul className="divide-y divide-border">
        {(users.data?.items ?? []).map((u) => (
          <li key={u.id} className="px-5 py-2">
            <PersonLink member={u} designation={label(u)} />
          </li>
        ))}
      </ul>
    </DataState>
  );
}

/** One level, shown a page at a time: each page is its own query, so "Show more" just adds the next one. */
function Level({
  parentId,
  depth,
  label,
}: {
  parentId: string | null;
  depth: number;
  label: (m: { designationId: string | null }) => string;
}) {
  const [pages, setPages] = useState(1);
  const pageNumbers = Array.from({ length: pages }, (_, k) => k + 1);
  return (
    <ul className="divide-y divide-border">
      {pageNumbers.map((n) => (
        <LevelPage
          key={n}
          parentId={parentId}
          page={n}
          depth={depth}
          label={label}
          isLast={n === pages}
          onMore={() => setPages(pages + 1)}
        />
      ))}
    </ul>
  );
}

function LevelPage({
  parentId,
  page,
  depth,
  label,
  isLast,
  onMore,
}: {
  parentId: string | null;
  page: number;
  depth: number;
  label: (m: { designationId: string | null }) => string;
  isLast: boolean;
  onMore: () => void;
}) {
  const query = useOrgChildren(parentId, page);
  if (query.isLoading) return <li className="px-5 py-3 text-sm text-text-muted">Loading…</li>;
  if (query.isError || !query.data) {
    return (
      <li className="px-5 py-3 text-sm text-danger-fg">
        Could not load.{' '}
        <button type="button" className="underline" onClick={() => void query.refetch()}>
          Try again
        </button>
      </li>
    );
  }
  const { items, total, totalPages } = query.data;
  return (
    <>
      {items.length === 0 && page === 1 ? (
        <li className="px-5 py-3 text-sm text-text-muted">
          {parentId ? 'No one reports here.' : 'No employees yet.'}
        </li>
      ) : null}
      {items.map((m) => (
        <OrgRow key={m.id} node={m} depth={depth} label={label} />
      ))}
      {isLast && page < totalPages ? (
        <li className="px-5 py-2" style={{ paddingLeft: `${20 + depth * 20}px` }}>
          <Button variant="secondary" onClick={onMore}>
            Show more ({total - (page - 1) * ORG_PAGE_SIZE - items.length} left)
          </Button>
        </li>
      ) : null}
    </>
  );
}

function OrgRow({
  node,
  depth,
  label,
}: {
  node: OrgNodeDto;
  depth: number;
  label: (m: { designationId: string | null }) => string;
}) {
  // Branches above RSM start open, so the page lands showing everyone down to the RSMs; RSMs and below open on click.
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(label(node)));
  return (
    <li>
      <div
        className="flex items-center gap-2 py-2 pr-5"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {node.directCount > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Hide ${node.name}'s team` : `Show ${node.name}'s team`}
            onClick={() => setOpen((v) => !v)}
            className="rounded p-0.5 text-text-subtle hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
          >
            {open ? (
              <ChevronDown aria-hidden className="size-4" />
            ) : (
              <ChevronRight aria-hidden className="size-4" />
            )}
          </button>
        ) : (
          <span className="size-5" />
        )}
        <PersonLink member={node} designation={label(node)} />
        {node.directCount > 0 ? (
          <span className="shrink-0 text-xs text-text-muted">
            {node.directCount} {node.directCount === 1 ? 'report' : 'reports'}
          </span>
        ) : null}
      </div>
      {open ? (
        <div className="border-t border-border">
          <Level parentId={node.id} depth={depth + 1} label={label} />
        </div>
      ) : null}
    </li>
  );
}
