'use client';

import { useState, type ReactNode } from 'react';
import { useSession } from '@/lib/auth/SessionProvider';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { year } = useFinancialYear();
  const [navOpen, setNavOpen] = useState(false);
  if (user === null) return null;

  return (
    <div className="flex min-h-screen">
      <div data-print-hide className="contents">
        <SideNav role={user.role} open={navOpen} onClose={() => setNavOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div data-print-hide className="contents">
          <TopBar onMenu={() => setNavOpen(true)} />
        </div>
        {year !== null ? (
          <div role="status" className="border-b border-warning/30 bg-warning-bg px-4 py-2.5 sm:px-8 text-sm text-warning-fg">
            Viewing financial year {year}–{String(year + 1).slice(2)}. This view is read-only.
          </div>
        ) : null}
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
