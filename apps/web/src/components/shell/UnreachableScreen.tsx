'use client';

import { ErrorState } from '@/components/ui/ErrorState';
import { useSession } from '@/lib/auth/SessionProvider';

export function UnreachableScreen() {
  const { retryBoot } = useSession();
  return (
    <main className="grid min-h-screen place-items-center">
      <ErrorState
        title="Cannot reach the server"
        message="The API did not answer. Check your connection and try again."
        onRetry={retryBoot}
      />
    </main>
  );
}
