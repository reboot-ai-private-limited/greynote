'use client';

import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
}

export function DropdownMenu({ trigger, items }: { trigger: ReactNode; items: readonly MenuItem[] }) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-md border border-border bg-surface p-1 shadow-pop"
        >
          {items.map((item) => (
            <RadixMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={`flex h-9 cursor-pointer select-none items-center rounded-sm px-3 text-sm outline-none data-[highlighted]:bg-surface-hover ${
                item.tone === 'danger' ? 'text-danger-fg' : 'text-text'
              }`}
            >
              {item.label}
            </RadixMenu.Item>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
