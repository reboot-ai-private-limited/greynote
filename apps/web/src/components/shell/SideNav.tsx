'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { RoleName } from '@greynote/contracts';
import { cn } from '@/components/ui/cn';
import { navFor } from './nav-items';

export function SideNav({ role }: { role: RoleName }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="w-rail shrink-0 border-r border-border bg-surface p-3">
      <div className="px-2 py-3 text-lg font-semibold">Greynote</div>
      <ul className="mt-2 space-y-0.5">
        {navFor(role).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              {item.comingSoon ? (
                <span
                  aria-disabled="true"
                  title="Coming soon"
                  className="block cursor-not-allowed rounded-md px-3 py-2 text-sm text-text-subtle opacity-60"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm hover:bg-surface-sunken',
                    active && 'bg-surface-sunken font-medium',
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
