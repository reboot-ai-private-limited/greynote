import { useContext, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ScrollAreaContext, type FormErrors } from '@/hooks/use-form-errors';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type Props = {
  form: FormErrors;
  name: string;
  children: ReactNode;
  /**
   * Draw the red outline and message around the children. Leave it on for pickers and chips; turn it off for a
   * TextField / DateField, which draw their own red border and message from their `error` prop.
   */
  outline?: boolean;
};

/** Wraps one input of a form: lets the form scroll to it, and (for pickers and chips) marks it red with its message. */
export function FormField({ form, name, children, outline = true }: Props) {
  const theme = useTheme();
  const scroll = useContext(ScrollAreaContext);
  const message = form.errors[name];
  const { setScroll } = form;
  useEffect(() => {
    setScroll(scroll);
  }, [scroll, setScroll]);

  return (
    <View
      ref={(node) => form.register(name, node)}
      collapsable={false}
      style={outline && message ? [styles.marked, { borderColor: theme.danger }] : undefined}>
      {children}
      {outline && message ? (
        <ThemedText type="small" themeColor="danger" style={styles.message}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marked: { borderWidth: 1.5, borderRadius: 12, padding: Spacing.two },
  message: { marginTop: Spacing.one },
});
