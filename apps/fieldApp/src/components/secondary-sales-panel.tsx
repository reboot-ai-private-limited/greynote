import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill, StatusBanner, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { SECONDARY_STATUS_TEXT, getEmployeeSales, saveEmployeeSecondary, submitEmployeeSecondary, type SecondaryStatus } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyMonth } from '@/offline/day';

const STATUS_ACCENT: Record<SecondaryStatus, Accent> = { DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

/** The server's reasons in the phone's words; anything else shows the server's own message. */
const errorText = (err: unknown) => {
  if (err instanceof ApiError) {
    if (err.data?.code === 'SECONDARY_LOCKED') return 'This month is with your manager or approved, so it can’t be changed. Ask for it to be sent back, or wait for the decision.';
    if (err.data?.code === 'SECONDARY_NEEDS_PTR') return 'This product has no PTS price, so enter units, not an amount.';
  }
  return err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';
};

/** What was typed for a product: which of the two boxes, and the text. The other box follows from the PTS. */
type Typed = { field: 'qty' | 'amount'; text: string };

/**
 * Secondary sales (docs/mobile/secondary-and-targets.md): the units of each product you sold on in the month, or the same as an
 * amount at the product's PTS — one figure, so typing one fills the other. You save a draft, then send the month to your
 * manager. Since 2026-10-14 this is **your own record only**: achievement is counted from your distributors' stock, so what is
 * entered here (and its approval) no longer counts toward targets. It is saved for you, not for an outlet, so it needs a
 * connection. `locked` is a month the server will not take entries for; a month outside the selected financial year is read-only.
 */
export function SecondarySalesPanel({ month, locked }: { month: string; locked: boolean }) {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();

  const [tick, setTick] = useState(0);
  const sales = useCachedFetch(`emp-secondary:${fy.year}:${month}`, () => getEmployeeSales(me?.id ?? '', month), tick);

  // What has been typed, kept with the month it belongs to, so another month starts clean.
  const [typed, setTyped] = useState<{ month: string; values: Record<string, Typed> }>({ month, values: {} });
  const edits = typed.month === month ? typed.values : {};
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const lines = sales.data?.lines ?? [];
  const fe = useFormErrors(lines.map((l) => l.product.id));
  const status = sales.data?.secondaryStatus ?? null;
  const outsideYear = month < fy.firstMonth || month > fy.lastMonth;
  // Pending and approved months are the manager's now; draft, sent-back and untouched months can be changed.
  const frozen = status === 'PENDING' || status === 'APPROVED';
  const readOnly = fy.isPast || outsideYear || locked || frozen;
  const changed = Object.keys(edits).length > 0;

  const setValue = (productId: string, field: Typed['field'], text: string) => {
    setMsg(null);
    fe.clear(productId);
    setTyped({ month, values: { ...edits, [productId]: { field, text: field === 'qty' ? text.replace(/[^0-9]/g, '') : text.replace(/[^0-9.]/g, '') } } });
  };

  /** Units and amount for a line as the screen shows them: what was typed, and the other worked out from the PTS. */
  const figures = (l: (typeof lines)[number]) => {
    const t = edits[l.product.id];
    const ptr = l.ptsPaise;
    if (!t) return { qty: l.secondaryQty === null ? '' : String(l.secondaryQty), amount: l.secondaryAmountPaise === null ? '' : String(l.secondaryAmountPaise / 100) };
    if (t.field === 'qty') {
      const qty = Number(t.text || 0);
      return { qty: t.text, amount: ptr && t.text !== '' ? String((qty * ptr) / 100) : '' };
    }
    const paise = rupeesToPaise(t.text);
    const units = ptr && paise ? Math.round(paise / ptr) : null;
    return { qty: units === null ? '' : String(units), amount: t.text };
  };

  const totalQty = lines.reduce((n, l) => n + Number(figures(l).qty || 0), 0);
  const totalPaise = lines.reduce((n, l) => n + (l.ptsPaise ? Number(figures(l).qty || 0) * l.ptsPaise : 0), 0);

  const save = async () => {
    if (!me) return;
    // Check every typed figure first: a bad amount must be marked, never quietly left out of what is saved.
    const problems: Record<string, string> = {};
    const toSend = lines.flatMap((l): { productId: string; qty?: number; amountPaise?: number }[] => {
      const t = edits[l.product.id];
      if (!t || t.text === '') return [];
      if (t.field === 'qty') return [{ productId: l.product.id, qty: Number(t.text) }];
      const amountPaise = rupeesToPaise(t.text);
      if (amountPaise === null) {
        problems[l.product.id] = 'Enter the amount in rupees, more than zero, with at most two decimals.';
        return [];
      }
      return [{ productId: l.product.id, amountPaise }];
    });
    if (Object.keys(problems).length > 0) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red. Nothing was saved.' });
      return fe.fail(problems);
    }
    if (toSend.length === 0) return setMsg({ tone: 'danger', text: 'Enter the units or the amount for at least one product.' });
    fe.clearAll();
    setBusy('save');
    setMsg(null);
    try {
      await saveEmployeeSecondary({ userId: me.id, month, lines: toSend });
      setTyped({ month, values: {} });
      setTick((t) => t + 1);
      setMsg({ tone: 'success', text: `Saved as a draft for ${prettyMonth(month)}. Send it for approval when it is complete.` });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy('send');
    setMsg(null);
    try {
      await submitEmployeeSecondary(month);
      setTick((t) => t + 1);
      setMsg({ tone: 'success', text: 'Sent to your manager for approval.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const banner =
    status === 'PENDING'
      ? { accent: 'amber' as const, icon: sym('clock', 'schedule'), title: 'Waiting for approval', text: 'Your manager has this month. It stays as your record once approved.' }
      : status === 'APPROVED'
        ? { accent: 'green' as const, icon: sym('checkmark.circle', 'check_circle'), title: 'Approved', text: 'This month is approved as your record.' }
        : status === 'REJECTED'
          ? { accent: 'red' as const, icon: sym('arrow.uturn.left.circle', 'undo'), title: 'Sent back', text: 'Change what is needed and send it again.' }
          : status === 'DRAFT'
            ? { accent: 'slate' as const, icon: sym('square.and.pencil', 'edit'), title: 'Draft', text: 'Not sent yet. Send it for approval when it is complete.' }
            : null;

  return (
    <View style={styles.stack}>
      <Notice tone="info" title="Your own record">
        Your achievement is counted from your distributors’ stock, so what you enter here is kept as your record and does not change it.
      </Notice>
      {banner ? <StatusBanner {...banner} /> : null}
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
          <SummaryStrip
            items={[
              { label: 'Units sold', value: totalQty, accent: 'green' },
              { label: 'Value at PTS', value: formatRupees(totalPaise), accent: 'teal' },
            ]}
          />
          {lines.map((l) => {
            const f = figures(l);
            const lineStatus = l.secondaryStatus;
            return (
              <InfoCard key={l.product.id}>
                <View style={styles.head}>
                  <View style={styles.grow}>
                    <ThemedText type="smallBold">{l.product.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {`Primary ${l.primaryQty}${l.adjustmentQty !== 0 ? ` (includes Admin's change of ${l.adjustmentQty})` : ''}${l.ptsPaise ? ` · PTS ${formatRupees(l.ptsPaise)}` : ' · no PTS, units only'}`}
                    </ThemedText>
                  </View>
                  {lineStatus ? <Pill text={SECONDARY_STATUS_TEXT[lineStatus]} accent={STATUS_ACCENT[lineStatus]} /> : null}
                </View>
                <FormField form={fe} name={l.product.id} outline={false}>
                  <View style={styles.pair}>
                    <View style={styles.grow}>
                      <TextField
                        label="Units sold"
                        value={f.qty}
                        onChangeText={(t) => setValue(l.product.id, 'qty', t)}
                        keyboardType="number-pad"
                        placeholder="0"
                        editable={busy === null && !readOnly && online}
                      />
                    </View>
                    {l.ptsPaise ? (
                      <View style={styles.grow}>
                        <TextField
                          label="Amount (₹)"
                          value={f.amount}
                          onChangeText={(t) => setValue(l.product.id, 'amount', t)}
                          error={fe.errors[l.product.id]}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          editable={busy === null && !readOnly && online}
                        />
                      </View>
                    ) : null}
                  </View>
                </FormField>
              </InfoCard>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary">
            Units and amount are one figure at the product’s PTS: type either and the other follows (an amount is rounded to whole units).
          </ThemedText>
          {readOnly ? null : (
            <View style={styles.actions}>
              <PrimaryButton label="Save draft" loading={busy === 'save'} disabled={!online || !changed || busy !== null} onPress={save} />
              {(status === 'DRAFT' || status === 'REJECTED') && !changed ? (
                <PrimaryButton label="Send for approval" loading={busy === 'send'} disabled={!online || busy !== null} onPress={send} />
              ) : null}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  pair: { flexDirection: 'row', gap: Spacing.two },
  actions: { gap: Spacing.two },
});
