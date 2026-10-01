'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useSyncExternalStore } from 'react';

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
      {current.map((t) => {
        const Icon = t.tone === 'error' ? CircleAlert : CircleCheck;
        return (
          <RadixToast.Root
            key={t.id}
            onOpenChange={(open) => {
              if (!open) emit(items.filter((i) => i.id !== t.id));
            }}
            className="flex gap-3 rounded-lg border border-border bg-surface p-4 text-sm shadow-pop"
          >
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${t.tone === 'error' ? 'text-danger' : 'text-success'}`} />
            <div>
              <RadixToast.Description className="text-text">{t.message}</RadixToast.Description>
              {t.requestId ? <p className="mt-1 text-xs text-text-subtle">Request ID: {t.requestId}</p> : null}
            </div>
          </RadixToast.Root>
        );
      })}
      <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-full flex-col gap-2" />
    </RadixToast.Provider>
  );
}
