/**
 * Design tokens as plain TypeScript — no React, no Tailwind — so they can be lifted into a
 * `packages/tokens` when the mobile app needs the same palette. `theme.css` mirrors these values
 * into Tailwind v4's `@theme`; `tokens.drift.test.ts` fails if the two disagree.
 */
export const colors = {
  surface: '#ffffff',
  surfaceSunken: '#f6f7f9',
  text: '#16181d',
  textSubtle: '#5b6270',
  border: '#e3e6eb',
  borderStrong: '#c9ced6',
  accent: '#3b4cca',
  accentText: '#ffffff',
  danger: '#b42318',
  success: '#157f3b',
  warning: '#a15c07',
} as const;

export type ColorToken = keyof typeof colors;
