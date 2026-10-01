'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export const Tabs = RadixTabs.Root;

export function TabsList({ children }: { children: ReactNode }) {
  return <RadixTabs.List className="flex gap-1 border-b border-border">{children}</RadixTabs.List>;
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-text-muted hover:text-text focus-visible:shadow-focus focus-visible:outline-none data-[state=active]:border-accent data-[state=active]:text-text"
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export const TabsContent = RadixTabs.Content;
