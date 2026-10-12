/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#208AEF',
    onPrimary: '#ffffff',
    border: '#DCDFE4',
    placeholder: '#9A9EA6',
    danger: '#D14343',
    warning: '#B7791F',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#3C9FFE',
    onPrimary: '#ffffff',
    border: '#33363B',
    placeholder: '#75797F',
    danger: '#FF6B6B',
    warning: '#F0B429',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Pastel tile backgrounds (`bg`, `border`) with the stronger colour (`solid`) for the icon chip on top. */
export const Accents = {
  blue: { bg: '#EAF1FF', border: '#D3E2FF', solid: '#3B82F6' },
  indigo: { bg: '#EEEEFF', border: '#DCDCFB', solid: '#6366F1' },
  teal: { bg: '#E2F5F0', border: '#C9ECE3', solid: '#14A38B' },
  sky: { bg: '#E5F3FE', border: '#CBE6FA', solid: '#0EA5E9' },
  green: { bg: '#E6F5E9', border: '#CDEBD3', solid: '#22A455' },
  lime: { bg: '#EEF5DD', border: '#DEEBBF', solid: '#6AA311' },
  purple: { bg: '#F1E8FE', border: '#E3D3FB', solid: '#9B5CF6' },
  red: { bg: '#FDEAEA', border: '#F9D3D4', solid: '#E5484D' },
  amber: { bg: '#FFF1DB', border: '#FCE2B8', solid: '#F59E0B' },
  pink: { bg: '#FFE8F1', border: '#FBD0E1', solid: '#EC4899' },
  orange: { bg: '#FFEADB', border: '#FCD5B8', solid: '#F97316' },
  slate: { bg: '#ECEEF3', border: '#DADEE6', solid: '#64748B' },
} as const;

export type Accent = keyof typeof Accents;

/** Home's blue header card, and the call-to-action gradient on the Summary & Submit tile. */
export const Gradients = {
  header: ['#2563EB', '#3B82F6', '#60A5FA'],
  cta: ['#F97316', '#EF4444', '#DC2663'],
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Forms and detail screens: a line of text stays readable at this width. */
export const MaxContentWidth = 800;
/** Tab screens (Home tile grid, lists): use more of a large tablet. */
export const WideContentWidth = 1200;
