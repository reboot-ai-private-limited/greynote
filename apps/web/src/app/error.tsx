'use client';

import { ErrorState } from '@/components/ui/ErrorState';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center">
      <ErrorState message="This page hit an unexpected problem." onRetry={reset} />
    </main>
  );
}
