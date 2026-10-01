'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { RoleName } from '@greynote/contracts';
import { cn } from '@/components/ui/cn';
import { navGroupsFor } from './nav-items';

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
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-sm font-bold text-accent-text">
            G
          </span>
          <span className={cn('text-[17px] font-semibold tracking-tight text-text', labelClass)}>Greynote</span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-2">
          {navGroupsFor(role).map(({ group, items }) => (
            <div key={group}>
              {/* Collapsed: a divider. Expanded (or in the drawer): the heading. */}
              <div className="relative h-6">
                <span aria-hidden className="absolute inset-x-1 top-1/2 hidden h-px bg-sidebar-border lg:block lg:group-hover/nav:opacity-0 lg:group-has-[:focus-visible]/nav:opacity-0" />
                <p className={cn('px-3 text-[11px] font-semibold uppercase leading-6 tracking-wider text-text-subtle', labelClass)}>
                  {group}
                </p>
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  const base = 'flex h-10 items-center gap-3 rounded-md px-3 text-sm';
                  return (
                    <li key={item.href}>
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
                            active
                              ? 'bg-accent text-accent-text'
                              : 'text-text-muted hover:bg-sidebar-hover hover:text-text',
                          )}
                        >
                          <Icon aria-hidden className="size-4 shrink-0" />
                          <span className={labelClass}>{item.label}</span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
