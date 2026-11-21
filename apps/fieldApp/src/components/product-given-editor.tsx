import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { TextField } from './text-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export type GivenProduct = { id: string; name: string; packSize: string | null };
export type GivenLine = { productId: string; quantity: number };

type Props = {
  /** Every product the phone knows. Nothing is checked against a balance or allocation. */
  products: GivenProduct[];
  value: GivenLine[];
  onChange: (lines: GivenLine[]) => void;
  /** Samples have a quantity; LBL is just the product (each one counts as one). */
  withQuantity: boolean;
  disabled?: boolean;
};

/**
 * What the employee gave a doctor: search a product by name, tap it to add, and for samples type the quantity. No credit is checked: the manager sees what was
 * requested, credited and given (Team → person → Samples & LBL).
 */
export function ProductGivenEditor({ products, value, onChange, withQuantity, disabled }: Props) {
  const theme = useTheme();
  const [term, setTerm] = useState('');
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const picked = new Set(value.map((l) => l.productId));
  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) => !picked.has(p.id) && p.name.toLowerCase().includes(t)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, products, value]);

  const add = (id: string) => {
    onChange([...value, { productId: id, quantity: 1 }]);
    setTerm('');
  };
  const setQuantity = (id: string, text: string) => {
    const n = Number(text.replace(/\D/g, ''));
    onChange(value.map((l) => (l.productId === id ? { ...l, quantity: Math.min(n, 1000) } : l)));
  };
  const remove = (id: string) => onChange(value.filter((l) => l.productId !== id));

  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <TextField label="Search a product" value={term} onChangeText={setTerm} placeholder="Type the product name" editable={!disabled} autoCapitalize="none" />
      {matches.map((p) => (
        <Pressable key={p.id} accessibilityLabel={`Add ${p.name}`} disabled={disabled} onPress={() => add(p.id)} style={[styles.match, { borderColor: theme.border }]}>
          <ThemedText type="default">{p.name}</ThemedText>
          {p.packSize ? <ThemedText type="small" themeColor="textSecondary">{p.packSize}</ThemedText> : null}
        </Pressable>
      ))}
      {term.trim() && matches.length === 0 ? <ThemedText type="small" themeColor="textSecondary">No product matches.</ThemedText> : null}
      {value.map((l) => (
        <View key={l.productId} style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="default">{byId.get(l.productId)?.name ?? 'Product'}</ThemedText>
          </View>
          {withQuantity ? (
            <View style={styles.qty}>
              <TextField label="Qty" value={l.quantity ? String(l.quantity) : ''} onChangeText={(t) => setQuantity(l.productId, t)} keyboardType="number-pad" maxLength={4} editable={!disabled} />
            </View>
          ) : null}
          <Pressable accessibilityLabel={`Remove ${byId.get(l.productId)?.name ?? 'product'}`} disabled={disabled} onPress={() => remove(l.productId)} style={styles.remove}>
            <ThemedText type="smallBold" themeColor="danger">Remove</ThemedText>
          </Pressable>
        </View>
      ))}
      {value.length === 0 && !term.trim() ? <ThemedText type="small" themeColor="textSecondary">{withQuantity ? 'None given. Search a product to add one.' : 'None given. Search a product to add its LBL.'}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  match: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  flex: { flex: 1, paddingBottom: Spacing.two },
  qty: { width: 90 },
  remove: { paddingBottom: Spacing.two },
});
