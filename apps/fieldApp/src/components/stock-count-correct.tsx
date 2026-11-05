import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import {
  closingOf,
  correctStockCounts,
  type SecondaryStockInput,
  type SecondaryStockLine,
  type StockCountDistributor,
  type StockCountsMonth,
} from '@/lib/stock-counts';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';

type Cells = { o: string; p: string; i: string };
const keyOf = (d: StockCountDistributor, l: SecondaryStockLine) => `${d.distributorId}:${l.product.id}`;
const toQty = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/** The server's reasons in the phone's words (docs/mobile/secondary-and-targets.md, "Correcting figures before approving"). */
const errorText = (err: unknown) => {
  if (err instanceof ApiError) {
    switch (err.data?.code) {
      case 'NOT_YOUR_TEAM':
        return 'Only the manager above this MR, or Admin, can correct their figures.';
      case 'SECONDARY_NOT_PENDING':
        return 'Only a month that is waiting for approval can be corrected. Refresh and try again.';
      case 'INVALID_PAYLOAD':
        return 'Secondary can’t be more than opening plus primary.';
    }
  }
  return err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';
};

/**
 * A manager's correction of a month that waits for approval: the same three numbers per row the MR sent (Closing is recalculated,
 * never typed), one reason for the whole change, and one `PATCH` for the rows that actually differ. Rows cannot be added or removed.
 */
export function StockCountCorrect({ data, onDone }: { data: StockCountsMonth; onDone: (changed: boolean) => void }) {
  const theme = useTheme();
  const [cells, setCells] = useState<Record<string, Cells>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Only rows the MR sent and that still wait: a draft, rejected or approved row cannot be corrected.
  const rows = data.distributors
    .filter((d) => d.status === 'PENDING')
    .map((d) => ({ d, lines: d.lines.filter((l) => l.saved && (l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0)) }))
    .filter((x) => x.lines.length > 0);

  const cellsOf = (d: StockCountDistributor, l: SecondaryStockLine): Cells =>
    cells[keyOf(d, l)] ?? { o: String(l.openingQty), p: String(l.primaryQty), i: String(l.issuedQty) };
  const set = (d: StockCountDistributor, l: SecondaryStockLine, field: keyof Cells, text: string) => {
    setCells({ ...cells, [keyOf(d, l)]: { ...cellsOf(d, l), [field]: text.replace(/[^0-9]/g, '') } });
    setMsg(null);
  };

  const changed = (): SecondaryStockInput[] =>
    rows.flatMap(({ d, lines }) =>
      lines.flatMap((l) => {
        const c = cellsOf(d, l);
        const [o, p, i] = [toQty(c.o), toQty(c.p), toQty(c.i)];
        if (o === l.openingQty && p === l.primaryQty && i === l.issuedQty) return [];
        return [{ distributorId: d.distributorId, productId: l.product.id, openingQty: o, primaryQty: p, issuedQty: i }];
      }),
    );

  const save = async () => {
    const list = changed();
    if (list.length === 0) return setMsg('Change at least one figure first.');
    if (list.some((l) => [l.openingQty, l.primaryQty, l.issuedQty].some(Number.isNaN))) return setMsg('Enter whole numbers only.');
    if (list.some((l) => l.issuedQty > l.openingQty + l.primaryQty)) return setMsg('Secondary can’t be more than opening plus primary. Fix the red rows.');
    if (reason.trim().length < 3) return setMsg('Give the reason for the correction (at least 3 characters). The MR and the approver will see it.');
    setBusy(true);
    try {
      await correctStockCounts(data.userId, data.month, reason, list);
      onDone(true);
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) return <Notice tone="info">There is nothing waiting that can be corrected.</Notice>;

  return (
    <View style={styles.stack}>
      <ThemedText type="smallBold">Correct figures</ThemedText>
      {rows.map(({ d, lines }) => (
        <View key={d.distributorId} style={styles.stack}>
          <ThemedText type="smallBold" themeColor="primary">{d.name}</ThemedText>
          {lines.map((l) => {
            const c = cellsOf(d, l);
            const [o, p, i] = [toQty(c.o), toQty(c.p), toQty(c.i)];
            const closing = closingOf(o, p, i);
            const bad = [o, p, i].some(Number.isNaN);
            return (
              <View key={l.product.id} style={styles.stack}>
                <ThemedText type="small">{l.product.name}</ThemedText>
                <View style={styles.fields}>
                  <View style={styles.field}>
                    <TextField label="Opening" keyboardType="number-pad" value={c.o} onChangeText={(t) => set(d, l, 'o', t)} />
                  </View>
                  <View style={styles.field}>
                    <TextField label="Primary" keyboardType="number-pad" value={c.p} onChangeText={(t) => set(d, l, 'p', t)} />
                  </View>
                  <View style={styles.field}>
                    <TextField label="Secondary" keyboardType="number-pad" value={c.i} onChangeText={(t) => set(d, l, 'i', t)} error={closing < 0 ? ' ' : undefined} />
                  </View>
                </View>
                <ThemedText type="small" style={{ color: closing < 0 ? theme.danger : theme.textSecondary }}>
                  {bad ? 'Closing —' : `Closing stock: ${closing} units${closing < 0 ? ' (below zero)' : ''}`}
                </ThemedText>
              </View>
            );
          })}
        </View>
      ))}
      <TextField label="Reason (required)" value={reason} onChangeText={(t) => { setReason(t); setMsg(null); }} maxLength={300} multiline />
      {msg ? <Notice tone="danger">{msg}</Notice> : null}
      <View style={styles.actions}>
        <View style={styles.field}>
          <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => onDone(false)} />
        </View>
        <View style={styles.field}>
          <PrimaryButton label="Save correction" loading={busy} onPress={() => void save()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  fields: { flexDirection: 'row', gap: Spacing.two },
  field: { flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
});
