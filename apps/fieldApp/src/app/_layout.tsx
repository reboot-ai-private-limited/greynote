import { DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useSessionUser } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

// Root stack: src/app/index.tsx (in-app splash/session-check) → src/app/login.tsx → the
// (tabs) group. Screens here render full-screen, without the bottom tab bar — the tab bar only
// wraps routes inside src/app/(tabs)/, per that group's own _layout.tsx.
//
// AnimatedSplashOverlay below is the NATIVE splash (app.json's expo-splash-screen plugin) — it
// hides itself the instant this tree lays out. It's a separate concept from the in-app Splash
// screen at index.tsx, which does the (currently stubbed) session check.
//
// Light theme only — see src/hooks/use-color-scheme.ts.
export default function RootLayout() {
  // Signed in → signed out while the app is open (logout, or a refresh the server rejected) →
  // back to Login. Done here, not in (tabs)/_layout.tsx, so the tab navigator is left untouched.
  const user = useSessionUser();
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (wasSignedIn.current && !user) router.replace('/login');
    wasSignedIn.current = !!user;
  }, [user]);

  return (
    <ThemeProvider value={DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="device-status" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}
