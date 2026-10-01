'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/lib/auth/SessionProvider';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { year } = useFinancialYear();
  if (user === null) return null;

  return (
    <div className="flex min-h-screen">
      <SideNav role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {year !== null ? (
          <div role="status" className="bg-warning/10 px-6 py-2 text-sm text-warning">
            Viewing financial year {year}–{String(year + 1).slice(2)}. This view is read-only.
          </div>
        ) : null}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
