/**
 * Design tokens as plain TypeScript — no React, no Tailwind — so they can be lifted into a
 * `packages/tokens` when the mobile app needs the same palette. `theme.css` mirrors these values
 * into Tailwind v4's `@theme`; `tokens.drift.test.ts` fails if the two disagree, and
 * `tokens.contrast.test.ts` fails if a text/background pair stops being readable.
 *
 * Two layers: RAMPS (`palette`) are raw scales; SEMANTIC tokens say what a colour is FOR.
 * Components use only the semantic names (`bg-surface`, `text-text-muted`) — never a ramp step
 * or a hex — so the whole look can change here without touching a screen.
 */
export const palette = {
  neutral: {
    0: '#ffffff',
    25: '#fbfbfc',
    50: '#f7f8fa',
    100: '#f1f3f6',
    200: '#e6e9ee',
    300: '#d3d8e0',
    400: '#a3abb9',
    500: '#636d80',
    600: '#515b6e',
    700: '#3b4455',
    800: '#252c39',
    900: '#131822',
  },
  accent: {
    50: '#f1f3ff',
    100: '#e4e8ff',
    200: '#cdd3ff',
    300: '#a9b2fb',
    400: '#818af5',
    500: '#5f66ea',
    600: '#4a4bd9',
    700: '#3d3cbd',
    800: '#34349a',
    900: '#2d2f7a',
  },
} as const;

/** What a colour is for. Values reference the ramps, so a retheme is a one-line change. */
export const semantic = {
  canvas: palette.neutral[0],
  surface: palette.neutral[0],
  surfaceSubtle: palette.neutral[50],
  surfaceHover: palette.neutral[100],
  border: palette.neutral[200],
  borderStrong: palette.neutral[300],
  text: palette.neutral[900],
  textMuted: palette.neutral[600],
  textSubtle: palette.neutral[500],
  accent: palette.accent[600],
  accentHover: palette.accent[700],
  accentSoft: palette.accent[50],
  accentSoftText: palette.accent[700],
  accentText: palette.neutral[0],
  focus: palette.accent[400],
  sidebar: palette.accent[50],
  sidebarBorder: palette.accent[100],
  sidebarHover: palette.accent[100],
} as const;

/**
 * Status colours: `bg` is the tint, `fg` the readable ink on it, `solid` the saturated mark
 * (dots, bars, borders). Read as "approved / pending / rejected-or-blocked".
 */
export const status = {
  success: { bg: '#ecf8f0', fg: '#166534', solid: '#16a34a' },
  warning: { bg: '#fff6e5', fg: '#8a4b05', solid: '#d97706' },
  danger: { bg: '#fdeeee', fg: '#a11d1d', solid: '#dc2626' },
} as const;

export const radius = { sm: '6px', md: '8px', lg: '12px' } as const;

/** Elevation is for things that FLOAT (menus, dialogs). Resting surfaces use a hairline border. */
export const shadow = {
  pop: '0 1px 2px rgb(19 24 34 / 0.06), 0 8px 24px rgb(19 24 34 / 0.12)',
  focus: '0 0 0 3px rgb(129 138 245 / 0.35)',
} as const;
