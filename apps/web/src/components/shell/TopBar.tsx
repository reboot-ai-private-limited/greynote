'use client';

import { ChevronDown, Menu } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useSession } from '@/lib/auth/SessionProvider';
import { FinancialYearSwitcher } from './FinancialYearSwitcher';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { user, signOut } = useSession();

  return (
    <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/95 px-8 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenu}
          className="rounded-md p-2 text-text-muted hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none lg:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        <FinancialYearSwitcher />
      </div>
      <DropdownMenu
        trigger={
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
          >
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-soft-text">
              {initials(user?.name ?? '')}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-medium text-text">{user?.name}</span>
              <span className="block text-xs text-text-subtle">{user?.role}</span>
            </span>
            <ChevronDown aria-hidden className="size-4 text-text-subtle" />
          </button>
        }
        items={[{ label: 'Sign out', onSelect: () => void signOut() }]}
      />
    </div>
  );
}
