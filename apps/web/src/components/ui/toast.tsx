'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { useSyncExternalStore } from 'react';
import { cn } from './cn';

interface ToastItem {
  id: number;
  tone: 'success' | 'error';
  message: string;
  requestId?: string | undefined;
}

let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: readonly ToastItem[]): void {
  items = next;
  for (const l of listeners) l();
}

function push(tone: ToastItem['tone'], message: string, requestId?: string): void {
  emit([...items, { id: nextId++, tone, message, requestId }]);
}

/** Writes toast; reads never do (a failed read renders an error state in place). */
export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string, requestId?: string) => push('error', message, requestId),
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <RadixToast.Provider duration={5000}>
      {current.map((t) => (
        <RadixToast.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) emit(items.filter((i) => i.id !== t.id));
          }}
          className={cn(
            'rounded-md border bg-surface p-3 text-sm shadow-lg',
            t.tone === 'error' ? 'border-danger' : 'border-success',
          )}
        >
          <RadixToast.Description>{t.message}</RadixToast.Description>
          {t.requestId ? <p className="mt-1 text-xs text-text-subtle">Request ID: {t.requestId}</p> : null}
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-full flex-col gap-2" />
    </RadixToast.Provider>
  );
}
