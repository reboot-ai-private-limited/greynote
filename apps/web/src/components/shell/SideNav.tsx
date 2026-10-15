'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RoleName } from '@greynote/contracts';
import { cn } from '@/components/ui/cn';
import { useApprovalBadge } from '@/features/approvals/hooks/useApprovalBadge';
import { activeGroupOf, isActiveItem, navGroupsFor, parseOpenGroups, toggleGroup, withGroupOpen, type NavGroupName } from './nav-items';

const STORAGE_KEY = 'greynote.nav.open';

/**
 * The text that is visible only when the rail is expanded. It is always in the DOM — fading it, not
 * hiding it — so screen readers still announce every item while the rail is collapsed.
 */
const labelClass = cn(
  'whitespace-nowrap lg:opacity-0 lg:transition-opacity lg:duration-150 motion-reduce:transition-none',
  'lg:group-hover/nav:opacity-100 lg:group-has-[:focus-visible]/nav:opacity-100',
);

/**
 * The main navigation.
 *
 * `lg+`: an icon-only rail (logo mark, icons) that expands over the page on hover or keyboard focus.
 * A fixed spacer reserves the collapsed width in the layout, so expanding never moves the content —
 * only this fixed element's width changes. Below `lg` it is an off-canvas drawer with labels always on.
 */
export function SideNav({
  role,
  open,
  onClose,
}: {
  role: RoleName;
  /** Below `lg` the nav is a drawer; this is whether it is showing. */
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const waiting = useApprovalBadge(role);
  const groups = navGroupsFor(role);

  // Which collapsible groups are open: what this browser remembers, plus the group holding the screen being looked at.
  const [openGroups, setOpenGroups] = useState<readonly NavGroupName[]>([]);
  const remembered = useRef(false);
  useEffect(() => {
    try {
      setOpenGroups(parseOpenGroups(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* no storage: groups start closed and the current one opens */
    }
    remembered.current = true;
  }, []);
  useEffect(() => {
    setOpenGroups((open) => withGroupOpen(open, activeGroupOf(role, pathname)));
  }, [role, pathname]);
  useEffect(() => {
    if (!remembered.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups));
    } catch {
      /* the choice just is not remembered */
    }
  }, [openGroups]);

  const navRef = useRef<HTMLElement>(null);

  // Escape collapses the rail (keyboard focus is what holds it open) and closes the mobile drawer.
  // A document listener rather than `onKeyDown` on the <nav>: a non-interactive element should not
  // carry key handlers, and Escape should work wherever focus is inside it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !navRef.current?.contains(document.activeElement)) return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div aria-hidden className="hidden w-rail-collapsed shrink-0 lg:block" />
      {open ? <div aria-hidden className="fixed inset-0 z-40 bg-neutral-900/40 lg:hidden" onClick={onClose} /> : null}
      <nav
        ref={navRef}
        aria-label="Main"
        className={cn(
          'group/nav fixed inset-y-0 left-0 z-50 flex w-rail flex-col overflow-hidden border-r border-sidebar-border bg-sidebar',
          'transition-[transform,width,box-shadow] duration-200 motion-reduce:transition-none',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop rail: collapsed to icons; expands (with a short hover-intent delay) over the page.
          'lg:z-40 lg:w-rail-collapsed lg:translate-x-0',
          'lg:hover:w-rail lg:hover:shadow-pop lg:hover:delay-100',
          'lg:has-[:focus-visible]:w-rail lg:has-[:focus-visible]:shadow-pop',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-4">
          {/* Collapsed rail shows the icon-only mark; the "Greynote" text fades in beside it when expanded. */}
          <Image src="/brand/logo-mark.png" alt="" width={36} height={36} priority className="size-9 shrink-0 object-contain" />
          <span className={cn('text-[17px] font-semibold tracking-tight text-text', labelClass)}>Greynote</span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-2">
          {groups.map(({ group, alwaysOpen, items }) => {
            const isOpen = alwaysOpen || openGroups.includes(group);
            const listId = `nav-group-${group.toLowerCase().replace(/\s+/g, '-')}`;
            return (
              <div key={group}>
                {/* Collapsed rail: a divider. Expanded (or in the drawer): the heading — a button that opens and closes the group, unless the group is always open. */}
                <div className="relative h-6">
                  <span aria-hidden className="absolute inset-x-1 top-1/2 hidden h-px bg-sidebar-border lg:block lg:group-hover/nav:opacity-0 lg:group-has-[:focus-visible]/nav:opacity-0" />
                  {alwaysOpen ? (
                    <p className={cn('px-3 text-[11px] font-semibold uppercase leading-6 tracking-wider text-text-subtle', labelClass)}>{group}</p>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      onClick={() => setOpenGroups((open) => toggleGroup(open, group))}
                      className={cn('flex w-full items-center justify-between rounded px-3 text-[11px] font-semibold uppercase leading-6 tracking-wider text-text-subtle hover:text-text focus-visible:shadow-focus focus-visible:outline-none', labelClass)}
                    >
                      {group}
                      <ChevronDown aria-hidden className={cn('size-3.5 transition-transform motion-reduce:transition-none', isOpen ? '' : '-rotate-90')} />
                    </button>
                  )}
                </div>
                <ul id={listId} hidden={!isOpen} className="space-y-0.5">
                  {items.map((item, index) => {
                    const active = isActiveItem(item, pathname);
                    const Icon = item.icon;
                    const base = 'flex h-10 items-center gap-3 rounded-md px-3 text-sm';
                    const newSection = item.section !== undefined && item.section !== items[index - 1]?.section;
                    const badge = item.href === '/approvals' && waiting !== undefined && waiting > 0 ? waiting : null;
                    return (
                      <li key={item.href}>
                        {newSection ? (
                          <p className={cn('px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-subtle/80', labelClass)}>{item.section}</p>
                        ) : null}
                        {item.comingSoon ? (
                          <span aria-disabled="true" title="Coming soon" className={cn(base, 'cursor-not-allowed text-text-subtle opacity-70')}>
                            <Icon aria-hidden className="size-4 shrink-0" />
                            <span className={labelClass}>{item.label}</span>
                          </span>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={onClose}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              base,
                              'font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none',
                              active ? 'bg-accent text-accent-text' : 'text-text-muted hover:bg-sidebar-hover hover:text-text',
                            )}
                          >
                            <span className="relative">
                              <Icon aria-hidden className="size-4 shrink-0" />
                              {badge !== null ? <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-danger lg:group-hover/nav:hidden lg:group-has-[:focus-visible]/nav:hidden" /> : null}
                            </span>
                            <span className={cn('flex-1', labelClass)}>{item.label}</span>
                            {badge !== null ? (
                              <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', active ? 'bg-accent-text text-accent' : 'bg-danger text-accent-text', labelClass)} aria-label={`${badge} waiting`}>
                                {badge}
                              </span>
                            ) : null}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}
