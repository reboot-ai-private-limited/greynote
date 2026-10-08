import { StyleSheet } from 'react-native';

import { Spacing, type ThemeColor } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const TONE: Record<'info' | 'warning' | 'danger' | 'success', ThemeColor> = {
  info: 'textSecondary',
  warning: 'warning',
  danger: 'danger',
  success: 'primary',
};

/** A short message box: how a screen explains a state (waiting, rejected, late, offline…). */
export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: keyof typeof TONE;
  title?: string;
  children?: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      {title ? (
        <ThemedText type="smallBold" themeColor={TONE[tone]}>
          {title}
        </ThemedText>
      ) : null}
      {children && children.trim() ? (
        <ThemedText type="small" themeColor={tone === 'info' ? 'textSecondary' : TONE[tone]}>
          {children}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
