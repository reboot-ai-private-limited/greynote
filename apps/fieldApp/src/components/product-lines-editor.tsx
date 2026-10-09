import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { OutletPicker } from './outlet-picker';
import { PrimaryButton } from './primary-button';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export type ProductOption = { id: string; name: string; subtitle?: string };
/** One product row: its id and the typed text of each column (kept as text so half-typed numbers survive). */
export type ProductLine = { productId: string; values: string[] };
export type LineColumn = { label: string; decimal?: boolean };

type Props = {
  products: ProductOption[];
  columns: LineColumn[];
  lines: ProductLine[];
  onChange: (lines: ProductLine[]) => void;
  /** What a new row starts with, per column. */
  defaults: (productId: string) => string[];
  disabled?: boolean;
  /** Shown under a row, e.g. its amount. */
  footer?: (line: ProductLine) => string | null;
};

/** A list of product rows with one or more typed numbers each; products are added by search. Used by Orders and Monthly Stock. */
export function ProductLinesEditor({ products, columns, lines, onChange, defaults, disabled, footer }: Props) {
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? 'Product';
  const available = products.filter((p) => !lines.some((l) => l.productId === p.id));
  const clean = (t: string, decimal?: boolean) => t.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');

  return (
    <View style={styles.wrap}>
      {lines.map((line) => (
        <ThemedView key={line.productId} type="backgroundElement" style={styles.card}>
          <View style={styles.head}>
            <ThemedText type="smallBold" style={styles.flex}>
              {name(line.productId)}
            </ThemedText>
            <PrimaryButton label="Remove" variant="text" disabled={disabled} onPress={() => onChange(lines.filter((l) => l.productId !== line.productId))} />
          </View>
          <View style={styles.cols}>
            {columns.map((c, i) => (
              <View key={c.label} style={styles.flex}>
                <TextField
                  label={c.label}
                  value={line.values[i] ?? ''}
                  keyboardType={c.decimal ? 'decimal-pad' : 'number-pad'}
                  editable={!disabled}
                  onChangeText={(t) =>
                    onChange(lines.map((l) => (l.productId === line.productId ? { ...l, values: l.values.map((v, j) => (j === i ? clean(t, c.decimal) : v)) } : l)))
                  }
                />
              </View>
            ))}
          </View>
          {footer?.(line) ? (
            <ThemedText type="small" themeColor="textSecondary">
              {footer(line)}
            </ThemedText>
          ) : null}
        </ThemedView>
      ))}
      <OutletPicker
        label={lines.length === 0 ? 'Add a product' : 'Add another product'}
        options={available}
        value={null}
        onChange={(id) => onChange([...lines, { productId: id, values: defaults(id) }])}
        disabled={disabled}
        emptyText={products.length === 0 ? 'No products have been synced yet. Connect once to load them.' : 'Every product is already in the list.'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  flex: { flex: 1 },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cols: { flexDirection: 'row', gap: Spacing.two },
});
