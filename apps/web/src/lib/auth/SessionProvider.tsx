'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserSummaryDto } from '@greynote/contracts';
import { authApi } from '../api/endpoints/auth';
import * as session from './session';

export type SessionStatus = 'booting' | 'authenticated' | 'anonymous' | 'unreachable';

interface SessionValue {
  status: SessionStatus;
  user: UserSummaryDto | null;
  signIn: (employeeCode: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryBoot: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Wraps the session module in React state. The module is the source of truth (token, timer,
 * single-flight refresh); this only mirrors what a component needs to branch on.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [user, setUser] = useState<UserSummaryDto | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const queryClient = useQueryClient();

  // Read by the subscriber, which must see the CURRENT status without re-subscribing.
  const statusRef = useRef(status);
  statusRef.current = status;

  // The session ending while the panel is open (a failed background refresh, or sign-out): one
  // path to `anonymous`, and the cache is cleared so the next user on a shared machine does not
  // inherit the previous user's rows.
  useEffect(
    () =>
      session.subscribe((token) => {
        if (token !== null || statusRef.current !== 'authenticated') return;
        queryClient.clear();
        setUser(null);
        setStatus('anonymous');
      }),
    [queryClient],
  );

  useEffect(() => {
    let cancelled = false;

    // Boot restore IS a silent refresh — there is no stored token to read.
    void (async () => {
      try {
        if (!(await session.restore())) {
          if (!cancelled) setStatus('anonymous');
          return;
        }
        const me = await session.withAuth(authApi.me);
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        // `restore` only throws when the server is unreachable — a 401 resolves to false.
        if (!cancelled) setStatus('unreachable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  const signIn = useCallback(async (employeeCode: string, password: string) => {
    await session.signIn(employeeCode, password);
    setUser(await session.withAuth(authApi.me));
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(() => session.signOut(), []);

  const retryBoot = useCallback(() => {
    setStatus('booting');
    setBootAttempt((n) => n + 1);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, user, signIn, signOut, retryBoot }),
    [status, user, signIn, signOut, retryBoot],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
