'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { UnreachableScreen } from '@/components/shell/UnreachableScreen';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/auth/SessionProvider';
import { loginPathFromHere } from '@/lib/auth/next-path';

/** The session gate: nothing under (panel) renders until a session exists. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginPathFromHere());
  }, [status, router]);

  if (status === 'unreachable') return <UnreachableScreen />;
  if (status !== 'authenticated') {
    return (
      <div role="status" aria-label="Loading" className="space-y-3 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
