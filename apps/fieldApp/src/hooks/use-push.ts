import { useEffect } from 'react';

import { registerForPush, setUpForegroundPush, watchPushArrived, watchPushTaps, watchPushToken } from '@/lib/push';
import { useSessionUser } from '@/lib/session';

setUpForegroundPush();

/**
 * Push for the signed-in employee: after sign-in the phone's Firebase token goes to the server, a push that arrives while the
 * app is open refreshes the unread count, and a tap (also the one that started the app) opens the screen the server named.
 * Mounted once in the root layout. Does nothing in Expo Go, which has no push module.
 */
export function usePush() {
  const userId = useSessionUser()?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void registerForPush();
    const stops = [watchPushToken(), watchPushArrived(), watchPushTaps()];
    return () => stops.forEach((stop) => stop());
  }, [userId]);
}
