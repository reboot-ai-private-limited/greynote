'use client';

import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';
import { navigate, type TreeItemInfo } from '@/lib/tree';

/**
 * An accessible tree (WAI-ARIA tree pattern): one tab stop, arrow keys move/expand/collapse.
 * Rows are discovered from the DOM, so a branch that owns its own data-loading can render its
 * children whenever they arrive and keyboard navigation still sees them.
 *
 * The roving tab stop is set on the DOM directly rather than held in React state: rows mount and
 * unmount inside branches the tree does not render itself, and syncing state to that would mean an
 * effect that sets state on every render.
 */
const ITEM = '[role="treeitem"]';

function readItems(root: HTMLElement): TreeItemInfo[] {
  return [...root.querySelectorAll<HTMLElement>(ITEM)].map((el) => ({
    id: el.dataset['treeId'] ?? '',
    parentId: el.dataset['treeParent'] || null,
    expanded: el.getAttribute('aria-expanded') === null ? undefined : el.getAttribute('aria-expanded') === 'true',
  }));
}

export function Tree({
  label,
  onExpand,
  onCollapse,
  children,
}: {
  label: string;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const activeRef = useRef<string | null>(null);

  /** Exactly one row is a tab stop: the active one, or the first if it is gone. */
  const applyTabStops = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLElement>(ITEM)];
    if (!rows.some((el) => el.dataset['treeId'] === activeRef.current)) {
      activeRef.current = rows[0]?.dataset['treeId'] ?? null;
    }
    for (const el of rows) el.tabIndex = el.dataset['treeId'] === activeRef.current ? 0 : -1;
  }, []);

  // After every render of the tree (a branch opening or closing re-renders it).
  useEffect(applyTabStops);

  const onFocus = useCallback(
    (event: FocusEvent<HTMLUListElement>) => {
      const target = event.target;
      if (target.getAttribute('role') !== 'treeitem') return;
      activeRef.current = target.dataset['treeId'] ?? null;
      applyTabStops();
    },
    [applyTabStops],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const root = ref.current;
      const target = event.target;
      if (!root || !(target instanceof HTMLElement) || target.getAttribute('role') !== 'treeitem') return;
      const id = target.dataset['treeId'];
      if (!id) return;
      const move = navigate(readItems(root), id, event.key);
      if (!move) return;
      event.preventDefault();
      if ('expand' in move) onExpand(move.expand);
      else if ('collapse' in move) onCollapse(move.collapse);
      else root.querySelector<HTMLElement>(`${ITEM}[data-tree-id="${CSS.escape(move.focus)}"]`)?.focus();
    },
    [onExpand, onCollapse],
  );

  return (
    // A tree is an interactive widget, so it owns the key and focus handlers.
    <ul ref={ref} role="tree" aria-label={label} onKeyDown={onKeyDown} onFocus={onFocus} className="py-1">
      {children}
    </ul>
  );
}

const INDENT_PX = 24;

export function TreeItem({
  id,
  parentId,
  level,
  expanded,
  onToggle,
  icon,
  label,
  badges,
  actions,
  children,
}: {
  id: string;
  parentId: string | null;
  level: number;
  /** `undefined` for a leaf. */
  expanded: boolean | undefined;
  onToggle?: () => void;
  icon: ReactNode;
  label: string;
  badges?: ReactNode;
  actions?: ReactNode;
  /** The branch (child items, or loading/empty/error rows) shown while expanded. */
  children?: ReactNode;
}) {
  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-expanded={expanded}
      aria-selected={false}
      data-tree-id={id}
      data-tree-parent={parentId ?? ''}
      // -1 here is the baseline: <Tree> promotes the active row to 0 directly on the DOM.
      tabIndex={-1}
      // The <li> owns focus but spans its whole subtree, so the ring goes on its own row only.
      className="outline-none focus-visible:[&>div:first-child]:shadow-focus"
    >
      <div
        className={cn(
          'flex h-11 items-center gap-2 rounded-md pr-2 hover:bg-surface-subtle',
        )}
        style={{ paddingLeft: 8 + (level - 1) * INDENT_PX }}
      >
        {expanded === undefined ? (
          <span aria-hidden className="size-6 shrink-0" />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            onClick={onToggle}
            className="grid size-6 shrink-0 place-items-center rounded text-text-subtle hover:bg-surface-hover"
          >
            <ChevronRight aria-hidden className={cn('size-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-90')} />
          </button>
        )}
        <span aria-hidden className="shrink-0 text-text-subtle">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{label}</span>
        {badges}
        <span className="shrink-0">{actions}</span>
      </div>
      {expanded ? <ul role="group">{children}</ul> : null}
    </li>
  );
}

/** A non-selectable row inside a branch: "Loading…", "No HQs yet", an error with retry. */
export function TreeNote({ level, children }: { level: number; children: ReactNode }) {
  return (
    <li role="none" style={{ paddingLeft: 8 + (level - 1) * INDENT_PX + 32 }} className="flex min-h-10 items-center gap-3 pr-2 text-[13px] text-text-subtle">
      {children}
    </li>
  );
}
