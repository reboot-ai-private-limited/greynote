import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  /** Shown under the field, in `danger` color, e.g. a validation message. */
  error?: string;
  /** Renders a show/hide toggle and masks input — for password fields. */
  secure?: boolean;
};

/**
 * The one text-input shape every mobile form screen in the PRD needs (Employee Code, Password,
 * Remarks, amounts, …) — built once here so ~40 upcoming screens share the same look and the
 * same error-state handling instead of each re-implementing it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, secure, style, ...inputProps },
  ref,
) {
  const theme = useTheme();
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.danger : focused ? theme.primary : 'transparent',
          },
        ]}>
        <TextInput
          ref={ref}
          placeholderTextColor={theme.placeholder}
          secureTextEntry={secure && !reveal}
          autoCapitalize={secure ? 'none' : inputProps.autoCapitalize}
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[styles.input, { color: theme.text }, style]}
          {...inputProps}
        />
        {secure ? (
          <Pressable onPress={() => setReveal((v) => !v)} hitSlop={8}>
            <ThemedText type="small" themeColor="primary">
              {reveal ? 'Hide' : 'Show'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.three,
  },
});
