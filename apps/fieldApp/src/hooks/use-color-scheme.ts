import type { ColorSchemeName } from 'react-native';

/**
 * My Greynote is light-theme only — the phone's dark-mode setting is deliberately ignored.
 * Every color lookup in the app goes through this hook, so turning dark mode back on later is a
 * one-line change here: return React Native's `useColorScheme()` instead.
 */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
