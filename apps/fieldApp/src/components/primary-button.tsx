import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  variant?: 'filled' | 'text';
};

export function PrimaryButton({
  label,
  loading,
  variant = 'filled',
  disabled,
  style,
  ...rest
}: PrimaryButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      style={(state) => [
        variant === 'filled' && styles.filled,
        variant === 'filled' && { backgroundColor: theme.primary },
        isDisabled && styles.disabled,
        state.pressed && !isDisabled && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'filled' ? theme.onPrimary : theme.primary} />
      ) : (
        <ThemedText
          type="smallBold"
          themeColor={variant === 'filled' ? 'onPrimary' : 'primary'}
          style={variant === 'text' && styles.textVariantLabel}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filled: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  textVariantLabel: {
    textAlign: 'center',
  },
});
