import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { getEmployeeSales, saveEmployeeSecondary } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyMonth } from '@/offline/day';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Secondary sales, a section of Monthly Stock: the units of each product you sold on in the month. This is your
 * achievement, measured against the targets set per product; primary (your Done distributor orders) is shown beside
 * it. It is saved for you, not for an outlet, so unlike a stock count it needs a connection. `locked` is a month the
 * server will not take entries for; a month outside the selected financial year is read-only too.
 */
export function SecondarySalesPanel({ month, locked }: { month: string; locked: boolean }) {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();

  const [tick, setTick] = useState(0);
  const sales = useCachedFetch(`emp-secondary:${fy.year}:${month}`, () => getEmployeeSales(me?.id ?? '', month), tick);
  // What has been typed, kept with the month it belongs to, so another month starts clean.
  const [typed, setTyped] = useState<{ month: string; values: Record<string, string> }>({ month, values: {} });
  const edits = typed.month === month ? typed.values : {};
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const lines = sales.data?.lines ?? [];
  const valueOf = (productId: string, saved: number | null) => edits[productId] ?? (saved === null ? '' : String(saved));
  const setValue = (productId: string, text: string) => {
    setMsg(null);
    setTyped({ month, values: { ...edits, [productId]: text.replace(/[^0-9]/g, '') } });
  };

  const outsideYear = month < fy.firstMonth || month > fy.lastMonth;
  const readOnly = fy.isPast || outsideYear || locked;
  const changed = Object.keys(edits).length > 0;
  const total = lines.reduce((n, l) => n + Number(valueOf(l.product.id, l.secondaryQty) || 0), 0);

  const save = async () => {
    if (!me) return;
    const toSend = lines.flatMap((l) => {
      const text = valueOf(l.product.id, l.secondaryQty);
      return text === '' ? [] : [{ productId: l.product.id, qty: Number(text) }];
    });
    if (toSend.length === 0) return setMsg({ tone: 'danger', text: 'Enter the units sold for at least one product.' });
    setBusy(true);
    setMsg(null);
    try {
      await saveEmployeeSecondary({ userId: me.id, month, lines: toSend });
      setTyped({ month, values: {} });
      setTick((t) => t + 1);
      setMsg({ tone: 'success', text: `Saved for ${prettyMonth(month)}.` });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack}>
      <ThemedText type="small" themeColor="textSecondary">
        Units you sold in the month. This is your achievement against your targets.
      </ThemedText>

      {!online ? <Notice tone="warning">Secondary sales are saved on the server. Connect to enter them.</Notice> : null}
      {outsideYear && !locked ? <Notice tone="info">This month is outside the selected financial year, so it can only be read.</Notice> : null}
      {sales.error && online ? <Notice tone="danger">{sales.error}</Notice> : null}
      {sales.stale && sales.fetchedAt && !online ? <Notice tone="info">Showing the last copy from this phone.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {sales.loading && !sales.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : lines.length === 0 ? (
        <Notice tone="info">{sales.data ? 'There are no products to enter.' : 'Connect once to load the products.'}</Notice>
      ) : (
        <>
          {lines.map((l) => (
            <ThemedView key={l.product.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{l.product.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`Primary ${l.primaryQty} units${l.adjustmentQty !== 0 ? ` (includes Admin's change of ${l.adjustmentQty})` : ''}`}
              </ThemedText>
              <TextField
                label="Secondary (units sold)"
                value={valueOf(l.product.id, l.secondaryQty)}
                onChangeText={(t) => setValue(l.product.id, t)}
                keyboardType="number-pad"
                placeholder="0"
                editable={!busy && !readOnly && online}
              />
            </ThemedView>
          ))}
          <ThemedText type="smallBold">{`Total secondary: ${total} units`}</ThemedText>
          {readOnly ? null : <PrimaryButton label="Save secondary sales" loading={busy} disabled={!online || !changed} onPress={save} />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
