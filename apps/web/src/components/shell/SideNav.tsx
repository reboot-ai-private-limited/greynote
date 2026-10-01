'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { RoleName } from '@greynote/contracts';
import { cn } from '@/components/ui/cn';
import { navGroupsFor } from './nav-items';

export function SideNav({ role }: { role: RoleName }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="sticky top-0 flex h-screen w-rail shrink-0 flex-col border-r border-border bg-surface-subtle">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span aria-hidden className="grid size-8 place-items-center rounded-md bg-accent text-sm font-bold text-accent-text">
          G
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-text">Greynote</span>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {navGroupsFor(role).map(({ group, items }) => (
          <div key={group}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">{group}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const base = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm';
                return (
                  <li key={item.href}>
                    {item.comingSoon ? (
                      <span aria-disabled="true" title="Coming soon" className={cn(base, 'cursor-not-allowed text-text-subtle opacity-70')}>
                        <Icon aria-hidden className="size-4" />
                        {item.label}
                      </span>
                    ) : (
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          base,
                          'font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text',
                          'focus-visible:shadow-focus focus-visible:outline-none',
                          active && 'bg-accent-soft text-accent-soft-text hover:bg-accent-soft hover:text-accent-soft-text',
                        )}
                      >
                        <Icon aria-hidden className="size-4" />
                        {item.label}
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
  );
}
