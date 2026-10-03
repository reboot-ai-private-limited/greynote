'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { UnreachableScreen } from '@/components/shell/UnreachableScreen';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePublicConfig } from '@/lib/hooks/usePublicConfig';
import { loginPathFromHere } from '@/lib/auth/next-path';

/** The session gate: nothing under (panel) renders until a session exists. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  // Dates depend on two server settings; read them before any screen draws a date. `isPending` covers the wait, and a failure falls back to the defaults.
  const config = usePublicConfig(status === 'authenticated');

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginPathFromHere());
  }, [status, router]);

  if (status === 'unreachable') return <UnreachableScreen />;
  if (status !== 'authenticated' || config.isPending) {
    return (
      <div role="status" aria-label="Loading" className="space-y-3 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
