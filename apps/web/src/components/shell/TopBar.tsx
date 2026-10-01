'use client';

import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/auth/SessionProvider';
import { FinancialYearSwitcher } from './FinancialYearSwitcher';

export function TopBar() {
  const { user, signOut } = useSession();

  return (
    <div className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <FinancialYearSwitcher />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-text-subtle">
          {user?.name} · {user?.role}
        </span>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
